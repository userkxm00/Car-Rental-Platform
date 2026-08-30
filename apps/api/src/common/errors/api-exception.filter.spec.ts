import {
  ArgumentsHost,
  ForbiddenException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter';

type MockResponse = {
  status: jest.Mock<MockResponse, [number]>;
  json: jest.Mock<MockResponse, [unknown]>;
};

function hostFor(headers: Record<string, string | string[] | undefined> = {}): {
  host: ArgumentsHost;
  response: MockResponse;
  request: { method: string; url: string; headers: Record<string, string | string[] | undefined> };
} {
  const request = { method: 'GET', url: '/api/v1/test', headers };
  const response: MockResponse = {
    status: jest.fn<MockResponse, [number]>().mockReturnThis(),
    json: jest.fn<MockResponse, [unknown]>().mockReturnThis(),
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  return { host, response, request };
}

function lastJsonBody(response: MockResponse): unknown {
  const call = response.json.mock.calls[0];
  expect(call).toBeDefined();
  return call?.[0];
}

describe('ApiExceptionFilter', () => {
  const filter = new ApiExceptionFilter();

  it('maps a 404 HttpException to the NOT_FOUND envelope', () => {
    const { host, response } = hostFor();
    filter.catch(new HttpException('Cannot GET /api/v1/nope', HttpStatus.NOT_FOUND), host);
    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      error: { code: 'NOT_FOUND', message: 'Cannot GET /api/v1/nope' },
    });
  });

  it('maps a 403 to FORBIDDEN and preserves app-provided messages', () => {
    const { host, response } = hostFor();
    filter.catch(new ForbiddenException('Agency access denied.'), host);
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      error: { code: 'FORBIDDEN', message: 'Agency access denied.' },
    });
  });

  it('preserves an explicit stable code and safe details payload', () => {
    const { host, response } = hostFor();
    filter.catch(
      new HttpException(
        {
          code: 'BOOKING_CONFLICT',
          message: 'The vehicle is no longer available.',
          details: { vehicleId: 'v-1' },
        },
        HttpStatus.CONFLICT,
      ),
      host,
    );
    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'BOOKING_CONFLICT',
        message: 'The vehicle is no longer available.',
        details: { vehicleId: 'v-1' },
      },
    });
  });

  it('keeps intentional 5xx responses readable (readiness failure)', () => {
    const { host, response } = hostFor();
    filter.catch(
      new ServiceUnavailableException({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service is not ready.',
        details: { database: 'down' },
      }),
      host,
    );
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service is not ready.',
        details: { database: 'down' },
      },
    });
  });

  it('masks unexpected errors and never leaks internal details', () => {
    const { host, response } = hostFor();
    filter.catch(new TypeError('secret internal detail: connection refused'), host);
    expect(response.status).toHaveBeenCalledWith(500);
    const body = lastJsonBody(response) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('An unexpected error occurred.');
    expect(JSON.stringify(body)).not.toContain('secret internal detail');
  });

  it('echoes the request ID when the request carries one', () => {
    const { host, response } = hostFor({ 'x-request-id': 'req-abc-123' });
    filter.catch(new HttpException('nope', HttpStatus.NOT_FOUND), host);
    expect(response.json).toHaveBeenCalledWith({
      error: { code: 'NOT_FOUND', message: 'nope', requestId: 'req-abc-123' },
    });
  });
});
