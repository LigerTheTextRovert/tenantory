import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isDev = config.get('NODE_ENV') === 'development';
        return {
          pinoHttp: {
            // Log level by environment
            level: isDev ? 'debug' : 'info',
            // Dev: pretty-printed, colourised, single-line
            // Prod: raw JSON (no transport = stdout JSON)
            transport: isDev
              ? {
                  target: 'pino-pretty',
                  options: { colorize: true, singleLine: true },
                }
              : undefined,
            // Never log sensitive headers into your storage
            redact: ['req.headers.authorization', 'req.headers.cookie'],
            // Control exactly which request/response fields are logged
            serializers: {
              req: (req: Request) => ({
                method: req.method,
                url: req.url,
                requestId: req.id,
              }),
              res: (res: Response) => ({
                statusCode: res.statusCode,
              }),
            },
          },
        };
      },
    }),
  ],
})
export class AppLoggerModule {}
