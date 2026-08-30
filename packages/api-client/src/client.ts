/**
 * Typed REST client for the KAVRIQO /api/v1 backend.
 *
 * Design rules (architecture/api-contracts-and-errors.md):
 * - every error response uses the documented envelope
 *   { error: { code, message, details?, requestId? } };
 * - clients match on the stable `code` — never on messages;
 * - the access token is provided by the host application (token provider),
 *   the client never stores credentials.
 */

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId?: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, envelope: ApiErrorEnvelope) {
    super(envelope.error.message);
    this.name = 'ApiError';
    this.code = envelope.error.code;
    this.status = status;
    this.requestId = envelope.error.requestId;
    this.details = envelope.error.details;
  }
}

export type TokenProvider = () => Promise<string | null>;

export interface ApiClientOptions {
  baseUrl: string;
  tokenProvider?: TokenProvider;
  fetchImpl?: typeof fetch;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  query?: Record<string, string | undefined>;
  body?: unknown;
  /** Extra headers (multipart handling is left to the caller). */
  headers?: Record<string, string>;
}

/**
 * Minimal typed fetch wrapper. Domain endpoints are exposed by the
 * namespace objects in endpoints.ts.
 */
export class ApiClient {
  private readonly baseUrl: string;
  private readonly tokenProvider?: TokenProvider;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.tokenProvider = options.tokenProvider;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const query = buildQuery(options.query);
    const url = `${this.baseUrl}${path}${query}`;
    const headers: Record<string, string> = { accept: 'application/json', ...options.headers };
    if (options.body !== undefined && options.headers?.['content-type'] === undefined) {
      headers['content-type'] = 'application/json';
    }

    const token = this.tokenProvider ? await this.tokenProvider() : null;
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }

    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    if (isFormData) {
      delete headers['content-type'];
    }

    const response = await this.fetchImpl(url, {
      method: options.method ?? 'GET',
      headers,
      body:
        options.body === undefined
          ? undefined
          : typeof options.body === 'string' || isFormData
            ? (options.body as string | FormData)
            : JSON.stringify(options.body),
    });

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    let payload: unknown = undefined;
    if (text.length > 0) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        payload = text;
      }
    }

    if (!response.ok) {
      const envelope = isErrorEnvelope(payload) ? payload : fallbackEnvelope(response.status, payload);
      throw new ApiError(response.status, envelope);
    }
    return payload as T;
  }

  get<T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  patch<T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
  }

  delete<T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}

function buildQuery(query: Record<string, string | undefined> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') {
      params.set(key, value);
    }
  }
  const serialized = params.toString();
  return serialized.length > 0 ? `?${serialized}` : '';
}

function isErrorEnvelope(payload: unknown): payload is ApiErrorEnvelope {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const error = (payload as { error?: unknown }).error;
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}

function fallbackEnvelope(status: number, payload: unknown): ApiErrorEnvelope {
  return {
    error: {
      code: 'INTERNAL_ERROR',
      message:
        typeof payload === 'string' ? payload : `Request failed with status ${status}.`,
    },
  };
}
