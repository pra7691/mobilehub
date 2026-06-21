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

    let message: unknown = 'Internal server error';
    let code: string | undefined;
    if (exception instanceof HttpException) {
      const r = exception.getResponse();
      if (typeof r === 'object' && r !== null) {
        const obj = r as Record<string, unknown>;
        message = 'message' in obj ? obj.message : exception.message;
        if (typeof obj.code === 'string') code = obj.code;
      } else {
        message = exception.message;
      }
    }

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
      ...(code !== undefined && { code }),
      message,
      requestId,
      timestamp: new Date().toISOString(),
      path: req.url,
    });
  }
}
