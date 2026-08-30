import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { currentRequestId } from './request-context';

/**
 * Emits one structured access log line per HTTP request with duration and
 * status, tagged with the correlation ID. Health probe endpoints are
 * excluded to keep load-balancer noise out of the logs.
 */
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HttpRequest');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = Date.now();
    const path = request.originalUrl;

    if (path.startsWith('/api/v1/health/')) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - startedAt;
          this.logger.log(
            `${request.method} ${path} ${response.statusCode} ${durationMs}ms requestId=${currentRequestId() ?? '-'}`,
          );
        },
        error: () => {
          const durationMs = Date.now() - startedAt;
          this.logger.warn(
            `${request.method} ${path} ${response.statusCode} ${durationMs}ms requestId=${currentRequestId() ?? '-'}`,
          );
        },
      }),
    );
  }
}
