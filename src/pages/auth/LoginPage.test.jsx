import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const login = vi.fn();
const clearError = vi.fn();
let authState = { login, isSubmitting: false, error: null, clearError };

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => authState,
}));

const getOAuthProviders = vi.fn(async () => ({
  providers: [
    { name: 'google', label: 'Google', configured: true },
  ],
}));

vi.mock('../../services/api', () => ({
  authService: { getOAuthProviders: (...a) => getOAuthProviders(...a) },
  oauthSignInUrl: (provider) => `http://localhost:8000/api/auth/${provider}`,
}));

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}));

import LoginPage from './LoginPage';

const renderLogin = (initialEntries = ['/login']) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <LoginPage />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  authState = { login, isSubmitting: false, error: null, clearError };
});

describe('Sign In — demo credentials are gone', () => {
  it('does not prefill any credentials', async () => {
    renderLogin();
    await waitFor(() => expect(getOAuthProviders).toHaveBeenCalled());
    expect(screen.getByLabelText(/email/i)).toHaveValue('');
    expect(screen.getByLabelText(/^password$/i)).toHaveValue('');
  });

  it('shows no demo credential hint anywhere on the page', async () => {
    const { container } = renderLogin();
    await waitFor(() => expect(getOAuthProviders).toHaveBeenCalled());
    // The whole rendered text, not just a labelled element: the old version
    // put these in a decorative box at the bottom of the form.
    expect(container.textContent).not.toMatch(/demo@churnguard\.ai/i);
    expect(container.textContent).not.toMatch(/demo2026/i);
    expect(container.textContent).not.toMatch(/demo credentials/i);
  });
});

describe('Sign In — validation', () => {
  it('rejects an empty submission without calling the API', async () => {
    renderLogin();

    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('rejects a malformed email', async () => {
    renderLogin();

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'not-an-email' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'some password' } });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });
});

describe('Sign In — submission', () => {
  it('signs in and navigates to the data-setup step', async () => {
    login.mockResolvedValueOnce({ user: { email: 'a@b.com' } });
    renderLogin();

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'correct horse battery' } });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith('a@b.com', 'correct horse battery', false)
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/data-management', { replace: true })
    );
  });

  it('passes the Remember me choice through to the API', async () => {
    login.mockResolvedValueOnce({ user: { email: 'a@b.com' } });
    renderLogin();

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'correct horse battery' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith('a@b.com', 'correct horse battery', true)
    );
  });

  it('returns the user to the page they were sent here from', async () => {
    login.mockResolvedValueOnce({ user: { email: 'a@b.com' } });
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/outreach' } }]}>
        <LoginPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'correct horse battery' } });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/outreach', { replace: true }));
  });

  it('does not navigate when sign-in fails', async () => {
    login.mockRejectedValueOnce(new Error('Invalid email or password.'));
    renderLogin();

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'wrong password' } });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => expect(login).toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('Sign In — states', () => {
  // These await the provider list before asserting. The fetch resolves after
  // the initial render and sets state; asserting synchronously passes, but
  // leaves that update to land outside act() and fill the run with warnings.
  it('shows the server error as an alert', async () => {
    authState = { ...authState, error: 'Invalid email or password.' };
    renderLogin();
    await waitFor(() => expect(getOAuthProviders).toHaveBeenCalled());

    expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password.');
  });

  it('surfaces an OAuth failure passed back in the query string', async () => {
    renderLogin(['/login?error=Sign-in%20was%20cancelled.']);
    await waitFor(() => expect(getOAuthProviders).toHaveBeenCalled());

    expect(screen.getByRole('alert')).toHaveTextContent('Sign-in was cancelled.');
  });

  it('disables the submit button while a request is in flight', async () => {
    authState = { ...authState, isSubmitting: true };
    renderLogin();
    await waitFor(() => expect(getOAuthProviders).toHaveBeenCalled());

    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
  });
});

describe('Sign In — OAuth buttons', () => {
  // jsdom refuses a real navigation, so `location.href = ...` throws
  // "Not implemented" unless the property is replaced. Replacing it is a
  // global mutation, so it is saved and restored around the one test that
  // needs it: leaving a stub in place leaked a `location` with nothing but
  // `href` into every later test in this file, which is the kind of thing
  // that fails intermittently depending on ordering rather than honestly.
  const realLocation = window.location;
  let assigned;

  beforeEach(() => {
    assigned = [];
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: realLocation,
    });
  });

  const stubLocation = () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: {
        ...realLocation,
        assign: (v) => assigned.push(v),
        replace: (v) => assigned.push(v),
        set href(v) { assigned.push(v); },
        get href() { return assigned.at(-1) ?? realLocation.href; },
      },
    });
  };

  it('sends the browser to the backend when Google is pressed', async () => {
    stubLocation();

    renderLogin();
    fireEvent.click(await screen.findByRole('button', { name: /google/i }));

    expect(assigned).toEqual(['http://localhost:8000/api/auth/google']);
  });

  it('offers no Microsoft sign-in anywhere in the auth UI', async () => {
    renderLogin();
    // Wait for the provider lookup to settle so this is not a race against
    // a button that appears late.
    await screen.findByRole('button', { name: /google/i });

    expect(screen.queryByRole('button', { name: /microsoft/i })).toBeNull();
    expect(screen.queryByText(/microsoft/i)).toBeNull();
  });

  it('keeps the email/password and reset controls intact', async () => {
    renderLogin();
    await screen.findByRole('button', { name: /google/i });

    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /forgot password/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign up/i })).toBeInTheDocument();
  });

  it('disables a provider the server has not configured, and explains why', async () => {
    getOAuthProviders.mockResolvedValueOnce({
      providers: [{ name: 'google', label: 'Google', configured: false }],
    });
    renderLogin();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /google/i })).toBeDisabled()
    );
    expect(screen.getByText(/google sign-in is not configured/i)).toBeInTheDocument();
  });

  it('leaves the buttons usable when the provider list cannot be fetched', async () => {
    getOAuthProviders.mockRejectedValueOnce(new Error('backend down'));
    renderLogin();

    // Disabling on a failed lookup would leave a permanently dead control;
    // pressing it instead produces a real, specific error.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /google/i })).toBeEnabled()
    );
  });
});
