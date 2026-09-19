import { EventEmitter } from 'node:events';
import { Request, Response } from 'express';
import { HttpMetricsMiddleware } from './http-metrics.middleware';
import { PrometheusService } from './prometheus.service';

const findCountLine = (metrics: string, labelFragment: string) =>
  metrics
    .split('\n')
    .find(
      (line) =>
        line.startsWith('http_request_duration_seconds_count{') &&
        line.includes(labelFragment),
    );

describe('HttpMetricsMiddleware', () => {
  let service: PrometheusService;
  let middleware: HttpMetricsMiddleware;

  beforeEach(() => {
    service = new PrometheusService();
    middleware = new HttpMetricsMiddleware(service);
  });

  const fakeReq = (partial: {
    method?: string;
    originalUrl?: string;
    routePath?: string;
  }): Request =>
    ({
      method: partial.method ?? 'GET',
      originalUrl: partial.originalUrl ?? '/api/v1/catalog/items/42',
      ...(partial.routePath ? { route: { path: partial.routePath } } : {}),
    }) as unknown as Request;

  const fakeRes = (statusCode: number): Response =>
    Object.assign(new EventEmitter(), { statusCode }) as unknown as Response;

  const run = (req: Request, res: Response) => {
    middleware.use(req, res, () => undefined);
    res.emit('finish');
  };

  it('records duration against the matched route pattern, not the raw URL', async () => {
    run(
      fakeReq({
        originalUrl: '/api/v1/catalog/items/42?include=stock',
        routePath: '/catalog/items/:itemId',
      }),
      fakeRes(200),
    );

    const line = findCountLine(
      await service.getMetrics(),
      'route="/catalog/items/:itemId"',
    );

    expect(line).toContain('http_request_duration_seconds_count');
    expect(line).toContain('method="GET"');
    expect(line).toContain('status_code="200"');
    expect(line).toMatch(/ 1$/);
    expect(line).not.toContain('items/42');
  });

  it('falls back to the bounded "unmatched" label when no route matched', async () => {
    run(fakeReq({ originalUrl: '/api/v1/does-not-exist/12345' }), fakeRes(404));

    const line = findCountLine(await service.getMetrics(), 'route="unmatched"');

    expect(line).toContain('http_request_duration_seconds_count');
    expect(line).toContain('status_code="404"');
    expect(line).not.toContain('does-not-exist');
  });

  it('does not observe the metrics endpoint itself', async () => {
    run(
      fakeReq({ originalUrl: '/api/v1/prometheus', routePath: '/prometheus' }),
      fakeRes(200),
    );

    const metrics = await service.getMetrics();

    expect(metrics).not.toContain('http_request_duration_seconds_count');
  });

  it('labels server errors with their status code', async () => {
    run(
      fakeReq({
        method: 'POST',
        originalUrl: '/api/v1/inventory/allocate',
        routePath: '/inventory/allocate',
      }),
      fakeRes(500),
    );

    const line = findCountLine(
      await service.getMetrics(),
      'route="/inventory/allocate"',
    );

    expect(line).toContain('method="POST"');
    expect(line).toContain('status_code="500"');
  });
});
