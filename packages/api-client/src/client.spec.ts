import { ApiClient, ApiError } from './client';

function toUrlString(input: string | URL | Request): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function jsonResponse(status: number, payload: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: () => Promise.resolve(JSON.stringify(payload)),
  } as unknown as Response;
}

describe('ApiClient', () => {
  it('sends the bearer token from the provider and parses JSON', async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const client = new ApiClient({
      baseUrl: 'http://api.test/',
      tokenProvider: () => Promise.resolve('tok-1'),
      fetchImpl: (url, init) => {
        calls.push({ url: toUrlString(url), headers: (init?.headers ?? {}) as Record<string, string> });
        return Promise.resolve(jsonResponse(200, { ok: true }));
      },
    });

    await expect(client.get('/api/v1/ping')).resolves.toEqual({ ok: true });
    expect(calls[0]?.url).toBe('http://api.test/api/v1/ping');
    expect(calls[0]?.headers.authorization).toBe('Bearer tok-1');
  });

  it('throws ApiError with the documented envelope and stable code', async () => {
    const client = new ApiClient({
      baseUrl: 'http://api.test',
      fetchImpl: () =>
        Promise.resolve(
          jsonResponse(409, {
            error: { code: 'VEHICLE_PLATE_TAKEN', message: 'Plate taken.', requestId: 'req-1' },
          }),
        ),
    });

    await expect(client.get('/api/v1/x')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'VEHICLE_PLATE_TAKEN',
      status: 409,
      requestId: 'req-1',
    });
  });

  it('falls back to a safe envelope for non-JSON error payloads', async () => {
    const client = new ApiClient({
      baseUrl: 'http://api.test',
      fetchImpl: () =>
        Promise.resolve({
          status: 502,
          ok: false,
          text: () => Promise.resolve('<html>bad gateway</html>'),
        } as unknown as Response),
    });

    await expect(client.get('/api/v1/x')).rejects.toBeInstanceOf(ApiError);
    await expect(client.get('/api/v1/x')).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      status: 502,
    });
  });

  it('serializes query parameters and skips empties', async () => {
    const calls: string[] = [];
    const client = new ApiClient({
      baseUrl: 'http://api.test',
      fetchImpl: (url) => {
        calls.push(toUrlString(url));
        return Promise.resolve(jsonResponse(200, {}));
      },
    });
    await client.get('/api/v1/vehicles', { query: { status: 'AVAILABLE', search: undefined } });
    expect(calls[0]).toBe('http://api.test/api/v1/vehicles?status=AVAILABLE');
  });

  it('passes FormData bodies through untouched for multipart uploads', async () => {
    const bodies: unknown[] = [];
    const client = new ApiClient({
      baseUrl: 'http://api.test',
      fetchImpl: (_url, init) => {
        bodies.push(init?.body);
        return Promise.resolve(jsonResponse(201, {}));
      },
    });
    const form = new FormData();
    form.append('file', new Blob(['x'], { type: 'image/png' }), 'x.png');
    await client.post('/api/v1/upload', form);
    expect(bodies[0]).toBe(form);
  });
});
