import { Module } from '@nestjs/common';
import { HttpMetricsMiddleware } from './http-metrics.middleware';
import { PrometheusController } from './prometheus.controller';
import { PrometheusService } from './prometheus.service';

@Module({
  controllers: [PrometheusController],
  providers: [PrometheusService, HttpMetricsMiddleware],
  exports: [PrometheusService, HttpMetricsMiddleware],
})
export class PrometheusModule {}
