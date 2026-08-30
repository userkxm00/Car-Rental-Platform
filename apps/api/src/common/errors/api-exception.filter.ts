import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiErrorBody, ApiErrorCode } from './api-error.contract';
import { currentRequestId } from '../observability/request-context';

const STATUS_TO_CODE: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: ApiErrorCode.VALIDATION_FAILED,
  [HttpStatus.UNAUTHORIZED]: ApiErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ApiErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ApiErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ApiErrorCode.CONFLICT,
  [HttpStatus.TOO_MANY_REQUESTS]: ApiErrorCode.RATE_LIMITED,
};

/**
 * Maps every thrown exception onto the documented error envelope.
 *
 * Security behavior:
 * - Unexpected (non-HttpException) errors become 500 INTERNAL_ERROR with a
 *   generic message; the real error is logged server-side with the
 *   request/correlation ID. Stack traces are never serialized.
 * - Deliberately thrown HttpExceptions surface their own app-approved message
 *   and optional details payload — including intentional 5xx responses such
 *   as readiness failure.
 * - The request ID is echoed when the request context carries one (the
 *   correlation middleware attaches it — see 01-A09).
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiException');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500 && !(exception instanceof HttpException)) {
      this.logger.error(
        `${request.method} ${request.url} failed with ${status} requestId=${currentRequestId() ?? '-'}`,
        exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
      );
    }

    const body: ApiErrorBody = {
      error: {
        code: this.resolveCode(status, exception),
        message: this.resolveMessage(exception),
      },
    };

    const details = this.resolveDetails(exception);
    if (details !== undefined) {
      body.error.details = details;
    }

    const requestId = request.headers['x-request-id'];
    if (typeof requestId === 'string' && requestId.length > 0) {
      body.error.requestId = requestId;
    }

    response.status(status).json(body);
  }

  private resolveCode(status: number, exception: unknown): string {
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null) {
        const code = (body as Record<string, unknown>)['code'];
        if (typeof code === 'string' && code.length > 0) {
          return code;
        }
      }
    }
    return STATUS_TO_CODE[status] ?? ApiErrorCode.INTERNAL_ERROR;
  }

  private resolveMessage(exception: unknown): string {
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        return body;
      }
      if (typeof body === 'object' && body !== null) {
        const message = (body as Record<string, unknown>)['message'];
        if (typeof message === 'string' && message.length > 0) {
          return message;
        }
      }
    }
    if (!(exception instanceof HttpException)) {
      return 'An unexpected error occurred.';
    }
    return 'Request failed.';
  }

  private resolveDetails(exception: unknown): Record<string, unknown> | undefined {
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null) {
        const details = (body as Record<string, unknown>)['details'];
        if (details !== null && typeof details === 'object' && !Array.isArray(details)) {
          return details as Record<string, unknown>;
        }
      }
    }
    return undefined;
  }
}
