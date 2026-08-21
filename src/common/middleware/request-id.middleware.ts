import { NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

export interface RequestWithRequestId extends Request {
  requestId: string;
}

export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const incoming = req.headers['x-request-id'];

    const requestId =
      (req as RequestWithRequestId).requestId ||
      (req as RequestWithRequestId).id ||
      (typeof incoming === 'string' && incoming.length > 0
        ? incoming
        : randomUUID());

    (req as RequestWithRequestId).requestId = requestId as string;
    res.setHeader('X-Request-Id', requestId as string);

    next();
  }
}
