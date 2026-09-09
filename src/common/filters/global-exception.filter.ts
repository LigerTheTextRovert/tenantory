import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { RequestWithRequestId } from '../middleware/request-id.middleware';

const isProduction = process.env.NODE_ENV === 'production';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();

    const { requestId } = request as RequestWithRequestId;

    const isHttpException = exception instanceof HttpException;

    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = isHttpException ? exception.getResponse() : null;

    let message: string | string[] = 'internal server error';
    let details: string[] | undefined;
    let errorMessage = HttpStatus[status] ?? 'Unknown Error';

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (
      exceptionResponse &&
      typeof exceptionResponse === 'object' &&
      'message' in exceptionResponse
    ) {
      const resp = exceptionResponse as {
        message: string | string[];
        error?: string;
      };

      if (resp.error) {
        errorMessage = resp.error;
      }

      if (Array.isArray(resp.message)) {
        details = resp.message;
        message = 'validation failed';
      } else {
        message = resp.message;
      }
    }

    // Log server errors with full context; client errors are expected noise
    if (status >= 500) {
      this.logger.error(
        `[${requestId ?? 'no-request-id'}] ${request.method || 'UNKNOWN'} ${request.originalUrl || request.url} ${status}`,
        exception instanceof Error
          ? exception.stack
          : typeof exception === 'string'
            ? exception
            : JSON.stringify(exception),
      );
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
      message,
      error: errorMessage,
      ...(details && { details }),
      ...(!isProduction &&
        exception instanceof Error && {
          stack: exception.stack,
        }),
    });
  }
}
