import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InquiryDetail } from './inquiry-detail';
import { jsonResponse, renderWithQuery } from '@/test/render';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'inquiry-id' }),
  useSearchParams: () => new URLSearchParams(),
}));
afterEach(() => vi.unstubAllGlobals());
const base = {
  id: 'inquiry-id',
  customerName: 'Alex Fernando',
  customerContact: 'alex@example.test',
  subject: 'Connection issue',
  description: 'Customer needs help.',
  status: 'NEW',
  version: 1,
  createdAt: '2026-11-18T10:00:00.000Z',
  updatedAt: '2026-11-18T10:00:00.000Z',
};

describe('inquiry detail', () => {
  it('shows a not-found state for missing or inaccessible inquiries', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { error: { code: 'NOT_FOUND', message: 'Inquiry not found.' } },
            404,
          ),
        ),
    );
    renderWithQuery(<InquiryDetail />);
    expect(
      await screen.findByRole('heading', { name: 'Inquiry not found' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to inquiries' }),
    ).toHaveAttribute('href', '/dashboard');
  });

  it('shows only the next valid action and confirms the saved status', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation((_url: string, options: RequestInit) =>
        Promise.resolve(
          jsonResponse({
            data:
              options.method === 'PATCH'
                ? { ...base, status: 'IN_PROGRESS', version: 2 }
                : base,
          }),
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    renderWithQuery(<InquiryDetail />);
    expect(
      await screen.findByRole('heading', { name: 'Connection issue' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Mark resolved' }),
    ).not.toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Start progress' }));
    expect(
      await screen.findByRole('button', { name: 'Mark resolved' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Status updated to In progress.',
    );
    const patch = fetchMock.mock.calls.find(
      (call) => (call[1] as RequestInit).method === 'PATCH',
    );
    expect(
      JSON.parse(String((patch?.[1] as RequestInit | undefined)?.body)),
    ).toEqual({ status: 'IN_PROGRESS', version: 1 });
  });

  it('does not offer reopening for a resolved inquiry', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ data: { ...base, status: 'RESOLVED', version: 3 } }),
        ),
    );
    renderWithQuery(<InquiryDetail />);
    expect(
      await screen.findByText(
        'This inquiry is resolved. No further status changes are available.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Start progress|Mark resolved/ }),
    ).not.toBeInTheDocument();
  });

  it('shows a version conflict without retrying and refreshes on request', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation((_url: string, options: RequestInit) => {
        if (options.method === 'PATCH')
          return Promise.resolve(
            jsonResponse(
              {
                error: {
                  code: 'VERSION_CONFLICT',
                  message: 'Refresh and try again.',
                },
              },
              409,
            ),
          );
        const getCount = fetchMock.mock.calls.filter(
          (call) => !(call[1] as RequestInit).method,
        ).length;
        return Promise.resolve(
          jsonResponse({
            data:
              getCount > 1
                ? { ...base, status: 'IN_PROGRESS', version: 2 }
                : base,
          }),
        );
      });
    vi.stubGlobal('fetch', fetchMock);
    renderWithQuery(<InquiryDetail />);
    await screen.findByRole('button', { name: 'Start progress' });
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Start progress' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'updated elsewhere',
    );
    expect(
      fetchMock.mock.calls.filter(
        (call) => (call[1] as RequestInit).method === 'PATCH',
      ),
    ).toHaveLength(1);
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Refresh inquiry' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Mark resolved' }),
      ).toBeInTheDocument(),
    );
    expect(
      fetchMock.mock.calls.filter(
        (call) => (call[1] as RequestInit).method === 'PATCH',
      ),
    ).toHaveLength(1);
  });
});
