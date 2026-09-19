import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { PrometheusService } from './prometheus.service';

// Raw-path exclusion: measuring the scrape of the metrics endpoint itself
// would feed the histogram with its own observations every 15s.
const EXCLUDED_RAW_PATHS = new Set(['/api/v1/prometheus']);

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly prometheusService: PrometheusService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const rawPath = req.originalUrl.split('?')[0];

    if (!EXCLUDED_RAW_PATHS.has(rawPath)) {
      this.prometheusService.trackHttpRequest(req, res);
    }

    next();
  }
}
