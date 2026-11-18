import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewInquiryForm } from './new-inquiry-form';
import { jsonResponse, renderWithQuery } from '@/test/render';

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => {
  vi.unstubAllGlobals();
  navigation.push.mockReset();
});

async function fillForm() {
  const user = userEvent.setup();
  await user.type(
    screen.getByRole('textbox', { name: 'Customer name' }),
    'Alex Fernando',
  );
  await user.type(
    screen.getByRole('textbox', { name: 'Contact information' }),
    '+94 77 123 4567',
  );
  await user.type(
    screen.getByRole('textbox', { name: 'Subject' }),
    'Connection issue',
  );
  await user.type(
    screen.getByRole('textbox', { name: 'Description' }),
    'Connection drops intermittently.',
  );
  return user;
}

describe('new inquiry form', () => {
  it('shows inline required validation with associated errors', async () => {
    renderWithQuery(<NewInquiryForm />);
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Save inquiry' }));
    expect(
      await screen.findByText('Customer name is required.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Customer name' }),
    ).toHaveAttribute('aria-describedby', 'customerName-error');
    expect(screen.getAllByRole('alert')).toHaveLength(4);
  });

  it('sends only customer fields and navigates after server confirmation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: { id: 'created-id' } }, 201));
    vi.stubGlobal('fetch', fetchMock);
    renderWithQuery(<NewInquiryForm />);
    const user = await fillForm();
    await user.click(screen.getByRole('button', { name: 'Save inquiry' }));
    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith(
        '/inquiries/created-id?created=1',
      ),
    );
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/inquiries');
    expect(options.credentials).toBe('include');
    expect(JSON.parse(options.body)).toEqual({
      customerName: 'Alex Fernando',
      customerContact: '+94 77 123 4567',
      subject: 'Connection issue',
      description: 'Connection drops intermittently.',
    });
  });

  it('disables a pending save and explains a possible network uncertainty', async () => {
    let finish: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithQuery(<NewInquiryForm />);
    const user = await fillForm();
    await user.click(screen.getByRole('button', { name: 'Save inquiry' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish?.(
      jsonResponse(
        { error: { code: 'INTERNAL_ERROR', message: 'Could not save.' } },
        500,
      ),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save.',
    );
    expect(navigation.push).not.toHaveBeenCalled();
  });
});
