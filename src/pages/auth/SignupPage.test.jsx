import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const signup = vi.fn();
const clearError = vi.fn();
let authState = { signup, isSubmitting: false, error: null, clearError };

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => authState,
}));

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}));

import SignupPage from './SignupPage';

const renderSignup = () =>
  render(
    <MemoryRouter>
      <SignupPage />
    </MemoryRouter>
  );

/** Fills every field with valid values, then applies overrides. */
const fill = (overrides = {}) => {
  const values = {
    'Full Name': 'Jane Smith',
    'Company Name': 'Acme Technologies',
    'Work Email': 'jane@acmetech.com',
    Password: 'correct horse battery',
    'Confirm Password': 'correct horse battery',
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
};

const submit = () => fireEvent.click(screen.getByRole('button', { name: /create account/i }));
const acceptTerms = () => fireEvent.click(screen.getByRole('checkbox'));

beforeEach(() => {
  vi.clearAllMocks();
  authState = { signup, isSubmitting: false, error: null, clearError };
});

describe('Sign Up — validation', () => {
  it('rejects mismatched passwords', async () => {
    renderSignup();
    fill({ 'Confirm Password': 'something else entirely' });
    acceptTerms();
    submit();

    expect(await screen.findByText(/passwords don't match/i)).toBeInTheDocument();
    expect(signup).not.toHaveBeenCalled();
  });

  it('rejects a password under 8 characters', async () => {
    renderSignup();
    fill({ Password: 'short', 'Confirm Password': 'short' });
    acceptTerms();
    submit();

    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(signup).not.toHaveBeenCalled();
  });

  it('rejects a malformed email', async () => {
    renderSignup();
    fill({ 'Work Email': 'not-an-email' });
    acceptTerms();
    submit();

    expect(await screen.findByText(/valid work email/i)).toBeInTheDocument();
    expect(signup).not.toHaveBeenCalled();
  });

  it('refuses to submit without accepting the Terms', async () => {
    renderSignup();
    fill();
    submit();

    expect(await screen.findByText(/must accept the terms/i)).toBeInTheDocument();
    expect(signup).not.toHaveBeenCalled();
  });
});

describe('Sign Up — submission', () => {
  it('sends the profile fields and the Terms acceptance, then goes to onboarding', async () => {
    signup.mockResolvedValueOnce({ user: { email: 'jane@acmetech.com' } });
    renderSignup();
    fill();
    acceptTerms();
    submit();

    await waitFor(() =>
      expect(signup).toHaveBeenCalledWith({
        name: 'Jane Smith',
        company: 'Acme Technologies',
        email: 'jane@acmetech.com',
        password: 'correct horse battery',
        // The server re-checks this, but it has to actually be sent.
        acceptedTerms: true,
      })
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/onboarding', { replace: true })
    );
  });

  it('never sends confirmPassword to the API', async () => {
    signup.mockResolvedValueOnce({ user: { email: 'jane@acmetech.com' } });
    renderSignup();
    fill();
    acceptTerms();
    submit();

    await waitFor(() => expect(signup).toHaveBeenCalled());
    expect(signup.mock.calls[0][0]).not.toHaveProperty('confirmPassword');
  });

  it('stays put and shows the server error when signup fails', async () => {
    authState = { ...authState, error: 'An account with this email already exists.' };
    signup.mockRejectedValueOnce(new Error('An account with this email already exists.'));
    renderSignup();
    fill();
    acceptTerms();
    submit();

    await waitFor(() => expect(signup).toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('already exists');
  });

  it('disables the submit button while the request is in flight', () => {
    authState = { ...authState, isSubmitting: true };
    renderSignup();

    expect(screen.getByRole('button', { name: /creating account/i })).toBeDisabled();
  });
});

describe('Sign Up — accessibility', () => {
  it('labels every field, so each is reachable by its visible name', () => {
    renderSignup();
    for (const label of ['Full Name', 'Company Name', 'Work Email', 'Password', 'Confirm Password']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('gives both password fields a named show/hide control', () => {
    renderSignup();
    // Previously these buttons had no accessible name and tabIndex={-1}.
    expect(screen.getAllByRole('button', { name: /show password/i })).toHaveLength(2);
  });
});
