import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

const getCurrentUser = vi.fn();
const login = vi.fn();
const logout = vi.fn();

vi.mock('../services/api', () => ({
  authService: {
    getCurrentUser: (...a) => getCurrentUser(...a),
    login: (...a) => login(...a),
    logout: (...a) => logout(...a),
    signup: vi.fn(),
  },
}));

import { AuthProvider, useAuth } from './AuthContext';

function Probe() {
  const { user, isAuthenticated, isLoading, logout: signOut } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="authed">{String(isAuthenticated)}</span>
      <span data-testid="email">{user?.email ?? ''}</span>
      <button onClick={signOut}>sign out</button>
    </div>
  );
}

const renderProvider = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('AuthContext — session restoration', () => {
  it('restores the user the server reports, with nothing in localStorage', async () => {
    // The central point of the rewrite: an empty localStorage is not evidence
    // of being signed out. The cookie the browser holds is what matters, and
    // only the server can read it.
    getCurrentUser.mockResolvedValueOnce({ id: '1', email: 'a@b.com', name: 'A' });
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('true'));
    expect(screen.getByTestId('email')).toHaveTextContent('a@b.com');
    expect(localStorage.getItem('churnguard_token')).toBeNull();
  });

  it('reports signed out when the server says there is no session', async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('authed')).toHaveTextContent('false');
  });

  it('holds isLoading until the session check resolves', async () => {
    let resolve;
    getCurrentUser.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    renderProvider();

    // Route guards render a loader while this is true, which is what stops a
    // refresh from flashing the sign-in page at an authenticated user.
    expect(screen.getByTestId('loading')).toHaveTextContent('true');

    await act(async () => { resolve({ id: '1', email: 'a@b.com' }); });
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
  });

  it('settles as signed out when the backend cannot be reached', async () => {
    getCurrentUser.mockRejectedValueOnce(new Error('network down'));
    renderProvider();

    // Must not hang on the startup loader forever.
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('authed')).toHaveTextContent('false');
  });

  it('checks the session only once per mount', async () => {
    getCurrentUser.mockResolvedValue({ id: '1', email: 'a@b.com' });
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('true'));
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
  });
});

describe('AuthContext — sign out', () => {
  it('calls the server and clears the user', async () => {
    getCurrentUser.mockResolvedValueOnce({ id: '1', email: 'a@b.com' });
    logout.mockResolvedValueOnce(undefined);
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('true'));
    await act(async () => { screen.getByRole('button', { name: /sign out/i }).click(); });

    // The server call is what actually ends the session; clearing local state
    // alone would leave it alive.
    expect(logout).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('false'));
    expect(screen.getByTestId('email')).toHaveTextContent('');
  });
});
