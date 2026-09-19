import { Injectable } from '@nestjs/common';
import * as client from 'prom-client';
import { Request, Response } from 'express';

// Buckets centered on the p90 < 50ms read-latency target, with headroom for
// cold cache and write paths.
const HTTP_DURATION_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5,
];

@Injectable()
export class PrometheusService {
  private readonly register: client.Registry;
  private readonly httpDuration: client.Histogram;

  constructor() {
    this.register = new client.Registry();
    this.register.setDefaultLabels({ app: 'tenantory' });
    client.collectDefaultMetrics({ register: this.register });

    this.httpDuration = new client.Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds by method, route pattern and status code',
      labelNames: ['method', 'route', 'status_code'],
      buckets: HTTP_DURATION_BUCKETS,
      registers: [this.register],
    });
  }

  getMetrics(): Promise<string> {
    return this.register.metrics();
  }

  getContentType(): string {
    return this.register.contentType;
  }

  trackHttpRequest(req: Request, res: Response): void {
    const stopTimer = this.httpDuration.startTimer();

    res.once('finish', () => {
      // `req.route` is untyped (`any`) in @types/express; narrow it explicitly
      // so the label can never smuggle an arbitrary runtime value through.
      const { route } = req as { route?: { path?: unknown } };

      // The route pattern is bounded by the number of declared routes. Never
      // label with the raw URL: dynamic segments and query strings would make
      // the label set unbounded and blow up Prometheus cardinality.
      stopTimer({
        method: req.method,
        route: typeof route?.path === 'string' ? route.path : 'unmatched',
        status_code: String(res.statusCode),
      });
    });
  }
}
