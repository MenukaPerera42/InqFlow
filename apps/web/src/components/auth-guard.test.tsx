import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthGuard } from './auth-guard';
import { WorkspaceShell } from './workspace-shell';
import { jsonResponse, renderWithQuery } from '@/test/render';

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  usePathname: () => '/dashboard',
}));
afterEach(() => {
  vi.unstubAllGlobals();
  navigation.replace.mockReset();
});

describe('session navigation', () => {
  it('redirects an unauthenticated visitor without showing protected content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required.',
            },
          },
          401,
        ),
      ),
    );
    renderWithQuery(
      <AuthGuard>
        <p>Private inquiry</p>
      </AuthGuard>,
    );
    expect(screen.queryByText('Private inquiry')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('/login'),
    );
    expect(screen.queryByText('Private inquiry')).not.toBeInTheDocument();
  });

  it('shows the workspace after session verification', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          user: { id: 'u1', name: 'Amina', email: 'amina@example.test' },
        }),
      ),
    );
    renderWithQuery(
      <AuthGuard>
        <p>Private inquiry</p>
      </AuthGuard>,
    );
    expect(await screen.findByText('Private inquiry')).toBeInTheDocument();
    expect(screen.getByText('Amina')).toBeInTheDocument();
  });

  it('clears user data only after confirmed logout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );
    const { queryClient } = renderWithQuery(
      <WorkspaceShell
        user={{ id: 'u1', name: 'Amina', email: 'amina@example.test' }}
      >
        <p>Private inquiry</p>
      </WorkspaceShell>,
    );
    queryClient.setQueryData(['inquiries'], { data: ['private'] });
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('/login'),
    );
    expect(queryClient.getQueryData(['inquiries'])).toBeUndefined();
  });
});
