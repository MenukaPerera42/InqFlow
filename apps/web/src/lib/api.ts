export type InquiryStatus = 'NEW' | 'IN_PROGRESS' | 'RESOLVED';
export interface StaffUser {
  id: string;
  name: string;
  email: string;
}
export interface Inquiry {
  id: string;
  customerName: string;
  customerContact: string;
  subject: string;
  description: string;
  status: InquiryStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface InquiryInput {
  customerName: string;
  customerContact: string;
  subject: string;
  description: string;
}
export interface InquiryFilters {
  page: number;
  pageSize: number;
  status?: InquiryStatus;
  search?: string;
}
export interface InquiryPage {
  data: Inquiry[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export const unauthorizedEvent = 'inqflow:unauthorized';
const apiBase = (
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
).replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  signal?: AbortSignal,
  redirectOnUnauthorized = true,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...options,
      signal,
      credentials: 'include',
      cache: 'no-store',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Could not reach the server. Check your connection and try again.',
    );
  }
  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error =
      body && typeof body === 'object' && 'error' in body ? body.error : null;
    const details =
      error &&
      typeof error === 'object' &&
      'code' in error &&
      'message' in error
        ? error
        : null;
    const code =
      details && typeof details.code === 'string'
        ? details.code
        : 'REQUEST_FAILED';
    const message =
      details && typeof details.message === 'string'
        ? details.message
        : 'The request could not be completed.';
    if (
      response.status === 401 &&
      redirectOnUnauthorized &&
      typeof window !== 'undefined'
    )
      window.dispatchEvent(new Event(unauthorizedEvent));
    throw new ApiError(response.status, code, message);
  }
  return body as T;
}

export const api = {
  login: (credentials: { email: string; password: string }) =>
    apiRequest<{ user: StaffUser }>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify(credentials) },
      undefined,
      false,
    ),
  me: (signal?: AbortSignal) =>
    apiRequest<{ user: StaffUser }>('/auth/me', {}, signal),
  logout: () => apiRequest<void>('/auth/logout', { method: 'POST' }),
  inquiries: (filters: InquiryFilters, signal?: AbortSignal) => {
    const query = new URLSearchParams({
      page: String(filters.page),
      pageSize: String(filters.pageSize),
    });
    if (filters.status) query.set('status', filters.status);
    if (filters.search) query.set('search', filters.search);
    return apiRequest<InquiryPage>(`/inquiries?${query}`, {}, signal);
  },
  inquiry: (id: string, signal?: AbortSignal) =>
    apiRequest<{ data: Inquiry }>(
      `/inquiries/${encodeURIComponent(id)}`,
      {},
      signal,
    ),
  createInquiry: (input: InquiryInput) =>
    apiRequest<{ data: Inquiry }>('/inquiries', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateStatus: (id: string, status: InquiryStatus, version: number) =>
    apiRequest<{ data: Inquiry }>(
      `/inquiries/${encodeURIComponent(id)}/status`,
      { method: 'PATCH', body: JSON.stringify({ status, version }) },
    ),
};

export const queryKeys = {
  me: ['auth', 'me'] as const,
  inquiries: (filters: InquiryFilters) => ['inquiries', filters] as const,
  inquiry: (id: string) => ['inquiry', id] as const,
};
