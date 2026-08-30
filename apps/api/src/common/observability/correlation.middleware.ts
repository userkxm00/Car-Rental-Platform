import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { runWithRequestContext } from './request-context';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Inbound request IDs must match this shape before they are trusted/logged. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Attaches a correlation ID to every request.
 *
 * - Honors a well-formed inbound `X-Request-ID` (bounded charset and length
 *   prevents log injection via header values).
 * - Generates a UUID otherwise.
 * - Always echoes the ID in the response header so clients and support logs
 *   share one identifier.
 */
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const inbound = request.headers[REQUEST_ID_HEADER];
    const requestId =
      typeof inbound === 'string' && SAFE_REQUEST_ID.test(inbound) ? inbound : randomUUID();

    response.setHeader(REQUEST_ID_HEADER, requestId);

    runWithRequestContext({ requestId, startedAt: Date.now() }, () => {
      next();
    });
  }
}
