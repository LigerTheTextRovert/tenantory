import { Controller, Get, Res } from '@nestjs/common';
import { PrometheusService } from './prometheus.service';
import { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';

@Public()
@Controller('prometheus')
export class PrometheusController {
  constructor(private readonly prometheusService: PrometheusService) {}

  @Get()
  async getMetrics(@Res() res: Response) {
    res.setHeader('Content-Type', this.prometheusService.getContentType());
    res.send(await this.prometheusService.getMetrics());
  }
}
