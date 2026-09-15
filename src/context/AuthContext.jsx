// ============================================
// ChurnGuard – Auth Context
// ============================================
//
// The single source of truth for "who is signed in" is the backend, asked
// once on startup via GET /api/auth/me.
//
// It used to be localStorage: a JWT and a JSON copy of the user were written
// there at sign-in and trusted on every subsequent load. That was wrong in
// both directions. A stale entry meant the app rendered a signed-in shell for
// a session the server had already rejected, and the reverse -- an empty
// localStorage -- was treated as proof of being signed out even when a
// perfectly valid session existed. Neither the token nor the user object lives
// on the client now; the session is an HttpOnly cookie the browser attaches by
// itself, and this context holds only what the server most recently said.

import { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import { authService } from '../services/api';

const AuthContext = createContext(null);

const initialState = {
  user: null,
  isAuthenticated: false,
  // Starts true, and stays true until the one startup /me call resolves.
  // Route guards render a loader while it is set rather than deciding, which
  // is what stops a refresh from flashing the sign-in page at someone who is
  // in fact signed in -- and stops a protected page flashing at someone who
  // isn't.
  isLoading: true,
  // Separate from isLoading: a login/signup request in flight, for disabling
  // the submit button. Conflating the two made the whole app show its startup
  // loader whenever a form was submitting.
  isSubmitting: false,
  error: null,
};

function authReducer(state, action) {
  switch (action.type) {
    case 'SESSION_RESTORED':
      return { ...state, user: action.payload, isAuthenticated: true, isLoading: false, error: null };
    case 'SESSION_ABSENT':
      return { ...state, user: null, isAuthenticated: false, isLoading: false };
    case 'SUBMIT_START':
      return { ...state, isSubmitting: true, error: null };
    case 'SUBMIT_SUCCESS':
      return {
        ...state,
        user: action.payload,
        isAuthenticated: true,
        isSubmitting: false,
        isLoading: false,
        error: null,
      };
    case 'SUBMIT_ERROR':
      return { ...state, error: action.payload, isSubmitting: false };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    case 'LOGGED_OUT':
      return { ...initialState, isLoading: false };
    default:
      return state;
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // React 18+ StrictMode mounts effects twice in development. Without this
  // guard that means two /auth/me calls on every single page load -- harmless
  // but wasteful, and it muddies the network tab when debugging auth.
  const restoreStarted = useRef(false);

  /** Re-asks the server who is signed in.
   *
   * Exposed as well as used at startup so a flow that changes session state
   * outside this context can resynchronise -- the OAuth callback page is the
   * one that needs it, since the session cookie arrives via a redirect that
   * this app never saw as a request. */
  const refreshSession = useCallback(async () => {
    try {
      const user = await authService.getCurrentUser();
      if (user) {
        dispatch({ type: 'SESSION_RESTORED', payload: user });
        return user;
      }
      dispatch({ type: 'SESSION_ABSENT' });
      return null;
    } catch {
      // Reached only when the server could not be asked at all (backend down,
      // network gone) -- getCurrentUser turns a 401 into null rather than
      // throwing. "Couldn't find out" is treated as not signed in so the app
      // stays usable and shows its own backend-unreachable notice, rather
      // than hanging on the startup loader forever.
      dispatch({ type: 'SESSION_ABSENT' });
      return null;
    }
  }, []);

  useEffect(() => {
    if (restoreStarted.current) return;
    restoreStarted.current = true;
    refreshSession();
  }, [refreshSession]);

  const login = async (email, password, remember = false) => {
    dispatch({ type: 'SUBMIT_START' });
    try {
      const data = await authService.login(email, password, remember);
      dispatch({ type: 'SUBMIT_SUCCESS', payload: data.user });
      return data;
    } catch (err) {
      const message = err.response?.data?.message || 'Sign-in failed. Please try again.';
      dispatch({ type: 'SUBMIT_ERROR', payload: message });
      throw new Error(message);
    }
  };

  const signup = async (data) => {
    dispatch({ type: 'SUBMIT_START' });
    try {
      const result = await authService.signup(data);
      dispatch({ type: 'SUBMIT_SUCCESS', payload: result.user });
      return result;
    } catch (err) {
      const message = err.response?.data?.message || 'Could not create your account. Please try again.';
      dispatch({ type: 'SUBMIT_ERROR', payload: message });
      throw new Error(message);
    }
  };

  /** The one place the app signs out.
   *
   * Both Profile -> Sign out and Security -> Sign out call this (via
   * useAuth), so there is a single logout path rather than two
   * implementations that can drift apart. */
  const logout = async () => {
    await authService.logout();
    dispatch({ type: 'LOGGED_OUT' });
  };

  const clearError = useCallback(() => dispatch({ type: 'CLEAR_ERROR' }), []);

  return (
    <AuthContext.Provider
      value={{ ...state, login, signup, logout, refreshSession, clearError }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
