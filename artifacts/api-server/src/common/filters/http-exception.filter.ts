import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('GlobalExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const requestId = (req as unknown as Record<string, unknown>)['requestId'] as string | undefined;
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? (() => {
            const r = exception.getResponse();
            return typeof r === 'object' && r !== null && 'message' in r
              ? (r as { message: unknown }).message
              : exception.message;
          })()
        : 'Internal server error';

    if (status >= 500) {
      this.logger.error({
        requestId,
        method: req.method,
        url: req.url,
        status,
        error: exception instanceof Error ? exception.message : String(exception),
        stack: exception instanceof Error ? exception.stack : undefined,
      });
    } else if (status >= 400) {
      this.logger.warn({
        requestId,
        method: req.method,
        url: req.url,
        status,
        message,
      });
    }

    res.status(status).json({
      statusCode: status,
      message,
      requestId,
      timestamp: new Date().toISOString(),
      path: req.url,
    });
  }
}
