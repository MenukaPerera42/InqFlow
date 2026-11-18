import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from './login-form';
import { jsonResponse, renderWithQuery } from '@/test/render';

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => {
  vi.unstubAllGlobals();
  navigation.replace.mockReset();
});

async function fillCredentials() {
  const user = userEvent.setup();
  await user.type(
    screen.getByRole('textbox', { name: 'Work email' }),
    'amina@example.test',
  );
  await user.type(screen.getByLabelText('Password'), 'correct-password');
  return user;
}

describe('login form', () => {
  it('shows accessible validation for required and invalid fields', async () => {
    renderWithQuery(<LoginForm />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(
      await screen.findByText('Enter a valid email address.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    await user.type(
      screen.getByRole('textbox', { name: 'Work email' }),
      'bad-email',
    );
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('textbox', { name: 'Work email' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('submits a credentialed request and navigates only after success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        user: { id: 'staff-id', name: 'Amina', email: 'amina@example.test' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithQuery(<LoginForm />);
    const user = await fillCredentials();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('/dashboard'),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/auth/login');
    expect(options.credentials).toBe('include');
    expect(JSON.parse(options.body)).toEqual({
      email: 'amina@example.test',
      password: 'correct-password',
    });
  });

  it('shows a safe failure and prevents a second pending submission', async () => {
    let finish: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithQuery(<LoginForm />);
    const user = await fillCredentials();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Signing in…' }),
      ).toBeDisabled(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish?.(
      jsonResponse(
        {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password.',
          },
        },
        401,
      ),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid email or password.',
    );
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
