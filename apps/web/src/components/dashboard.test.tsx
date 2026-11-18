import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dashboard } from './dashboard';
import { jsonResponse, renderWithQuery } from '@/test/render';

const inquiry = (
  id: string,
  subject: string,
  status: 'NEW' | 'IN_PROGRESS' = 'NEW',
) => ({
  id,
  customerName: 'Alex Fernando',
  customerContact: 'alex@example.test',
  subject,
  description: 'Details',
  status,
  version: 1,
  createdAt: '2026-11-18T10:00:00.000Z',
  updatedAt: '2026-11-18T10:00:00.000Z',
});
afterEach(() => vi.unstubAllGlobals());

describe('dashboard', () => {
  it('shows loading then an empty state with a creation action', async () => {
    let finish: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    renderWithQuery(<Dashboard />);
    expect(screen.getByText('Loading inquiries…')).toBeInTheDocument();
    finish?.(
      jsonResponse({
        data: [],
        pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
      }),
    );
    expect(await screen.findByText('No inquiries yet')).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: /New inquiry/i })[0],
    ).toHaveAttribute('href', '/inquiries/new');
  });

  it('uses backend search, status, and pagination parameters', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const query = new URL(url).searchParams;
      const page = Number(query.get('page'));
      const data =
        page === 1
          ? [inquiry('1', 'Connection issue')]
          : [inquiry('2', 'Connection follow-up')];
      return Promise.resolve(
        jsonResponse({
          data,
          pagination: { page, pageSize: 10, total: 2, totalPages: 2 },
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithQuery(<Dashboard />);
    const user = userEvent.setup();
    expect(await screen.findByText(/Page 1 of 2/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText(/Page 2 of 2/)).toBeInTheDocument();
    await user.type(
      screen.getByRole('searchbox', { name: 'Search inquiries' }),
      'connection',
    );
    await waitFor(
      () =>
        expect(
          fetchMock.mock.calls.some(
            (call) =>
              new URL(String(call[0])).searchParams.get('search') ===
              'connection',
          ),
        ).toBe(true),
      { timeout: 2000 },
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Status' }),
      'NEW',
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          (call) =>
            new URL(String(call[0])).searchParams.get('status') === 'NEW',
        ),
      ).toBe(true),
    );
    expect(
      screen.getAllByRole('link', { name: 'Open Connection issue' })[0],
    ).toHaveAttribute('href', '/inquiries/1');
  });

  it('shows an error and retries', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(
        jsonResponse({
          data: [],
          pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    renderWithQuery(<Dashboard />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load inquiries.',
    );
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No inquiries yet')).toBeInTheDocument();
  });
});
