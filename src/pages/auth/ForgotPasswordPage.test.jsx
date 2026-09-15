import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const forgotPassword = vi.fn();

vi.mock('../../services/api', () => ({
  authService: { forgotPassword: (...a) => forgotPassword(...a) },
}));

import ForgotPasswordPage from './ForgotPasswordPage';

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/forgot-password']}>
      <ForgotPasswordPage />
    </MemoryRouter>
  );

/** Fills the email field and presses the button, the way a person would. */
const submit = (address) => {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: address } });
  fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
};

/** The shape the backend actually returns — see auth_routes.forgot_password.
 *  Deliberately identical for a registered and an unregistered address. */
const accepted = (overrides = {}) => ({
  message: "If an account exists for that email, we've sent a link to reset the password.",
  emailDelivered: true,
  expiresInMinutes: 30,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  forgotPassword.mockResolvedValue(accepted());
});

describe('Forgot password — the form', () => {
  it('renders the prompt, the field and the way back', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: /reset your password/i })).toBeInTheDocument();
    expect(screen.getByText(/enter the email associated with your account/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to sign in/i })).toHaveAttribute('href', '/login');
  });

  it('keeps the button disabled until something is typed', () => {
    renderPage();
    const button = screen.getByRole('button', { name: /send reset link/i });

    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    expect(button).toBeEnabled();
  });

  it('refuses a malformed address without calling the API', async () => {
    renderPage();
    submit('not-an-email');

    expect(await screen.findByRole('alert')).toHaveTextContent(/valid email address/i);
    expect(forgotPassword).not.toHaveBeenCalled();
  });

  it('refuses whitespace as an address', async () => {
    renderPage();
    submit('   ');

    // The button is disabled for whitespace-only input, so nothing is sent.
    expect(forgotPassword).not.toHaveBeenCalled();
  });

  it('trims the address before sending it', async () => {
    renderPage();
    submit('  Ada@Example.com  ');

    await waitFor(() => expect(forgotPassword).toHaveBeenCalledWith('Ada@Example.com'));
  });

  it('clears a validation error as soon as the field is edited', async () => {
    renderPage();
    submit('nope');
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'ada@example.com' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('Forgot password — loading state', () => {
  it('shows progress and cannot be submitted twice', async () => {
    let resolve;
    forgotPassword.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderPage();
    submit('ada@example.com');

    const button = await screen.findByRole('button', { name: /sending/i });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(forgotPassword).toHaveBeenCalledTimes(1);

    resolve(accepted());
    await screen.findByRole('heading', { name: /check your email/i });
  });
});

describe('Forgot password — success state', () => {
  it('shows "Check your email" without confirming the account exists', async () => {
    renderPage();
    submit('ada@example.com');

    expect(await screen.findByRole('heading', { name: /check your email/i })).toBeInTheDocument();
    // The hedge is the point: stating that a link *was* sent to this address
    // would turn the form into an account-existence oracle.
    expect(screen.getByText(/if an account exists/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to sign in/i })).toBeInTheDocument();
  });

  it('quotes the expiry the server actually issued, not a hardcoded one', async () => {
    forgotPassword.mockResolvedValue(accepted({ expiresInMinutes: 45 }));
    renderPage();
    submit('ada@example.com');

    expect(await screen.findByText(/expires in 45 minutes/i)).toBeInTheDocument();
  });

  it('renders identically for an address that has no account', async () => {
    // The backend returns the same body either way; this asserts the page does
    // not reintroduce a difference at the last step.
    renderPage();
    submit('ada@example.com');
    const registered = (await screen.findByRole('heading', { name: /check your email/i }))
      .parentElement.textContent;

    renderPage();
    const fields = screen.getAllByLabelText(/email/i);
    fireEvent.change(fields[fields.length - 1], { target: { value: 'nobody@example.com' } });
    const buttons = screen.getAllByRole('button', { name: /send reset link/i });
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() => expect(screen.getAllByRole('heading', { name: /check your email/i })).toHaveLength(2));
    const unregistered = screen.getAllByRole('heading', { name: /check your email/i })[1]
      .parentElement.textContent;

    expect(unregistered.replace('nobody@example.com', 'ada@example.com')).toBe(registered);
  });

  it('says plainly when the server cannot send mail, instead of claiming it did', async () => {
    forgotPassword.mockResolvedValue(
      accepted({
        emailDelivered: false,
        developerNotice: "Email delivery isn't configured on this server (set SMTP_HOST in backend/.env).",
      })
    );
    renderPage();
    submit('ada@example.com');

    expect(
      await screen.findByRole('heading', { name: /email delivery not configured/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/set SMTP_HOST in backend\/\.env/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /check your email/i })).not.toBeInTheDocument();
  });
});

describe('Forgot password — error states', () => {
  it('explains a rate limit as something to wait out', async () => {
    forgotPassword.mockRejectedValue({
      response: {
        status: 429,
        data: { message: 'Too many password reset requests. Please wait a few minutes and try again.' },
      },
    });
    renderPage();
    submit('ada@example.com');

    expect(await screen.findByRole('alert')).toHaveTextContent(/wait a few minutes/i);
    // Still on the form, so the request can be retried once the window clears.
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('recovers from a network failure with a retryable message', async () => {
    forgotPassword.mockRejectedValue(new Error('Network Error'));
    renderPage();
    submit('ada@example.com');

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not request a reset/i);
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeEnabled();
  });

  it('never leaves the button stuck in its loading state after a failure', async () => {
    forgotPassword.mockRejectedValue(new Error('boom'));
    renderPage();
    submit('ada@example.com');

    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: /sending/i })).not.toBeInTheDocument();
  });
});
