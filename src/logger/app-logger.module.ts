import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { LoggerModule } from 'nestjs-pino';
import { stdSerializers } from 'pino';

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
						// Use our custom requestId instead of auto-generated ones
						genReqId: (req: Request) => {
							const incoming = req.headers['x-request-id'];
							return typeof incoming === 'string' && incoming.length > 0
								? incoming
								: randomUUID();
						},
						// Control exactly which request/response fields are logged
						serializers: {
							req: (req: Request) => {
								const standardReq = stdSerializers.req(req);
								return {
									...standardReq,
									requestId:
										req.id ||
										(req as Request & { requestId?: string }).requestId,
								};
							},
							res: (res: Response) => stdSerializers.res(res),
						},
					},
				};
			},
		}),
	],
})
export class AppLoggerModule {}
