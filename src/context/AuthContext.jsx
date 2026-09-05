// ============================================
// ChurnGuard – Auth Context
// ============================================

import { createContext, useContext, useReducer, useEffect } from 'react';
import { authService } from '../services/api';

const AuthContext = createContext(null);

const initialState = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
};

function authReducer(state, action) {
  switch (action.type) {
    case 'AUTH_INIT':
      return { ...state, user: action.payload.user, token: action.payload.token, isAuthenticated: true, isLoading: false };
    case 'AUTH_LOADING':
      return { ...state, isLoading: true, error: null };
    case 'AUTH_SUCCESS':
      return { ...state, user: action.payload.user, token: action.payload.token, isAuthenticated: true, isLoading: false, error: null };
    case 'AUTH_ERROR':
      return { ...state, error: action.payload, isLoading: false };
    case 'AUTH_LOGOUT':
      return { ...initialState, isLoading: false };
    case 'AUTH_LOADED':
      return { ...state, isLoading: false };
    default:
      return state;
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  useEffect(() => {
    const token = localStorage.getItem('churnguard_token');
    const userStr = localStorage.getItem('churnguard_user');
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        dispatch({ type: 'AUTH_INIT', payload: { user, token } });
      } catch {
        dispatch({ type: 'AUTH_LOADED' });
      }
    } else {
      dispatch({ type: 'AUTH_LOADED' });
    }
  }, []);

  const login = async (email, password) => {
    dispatch({ type: 'AUTH_LOADING' });
    try {
      const data = await authService.login(email, password);
      localStorage.setItem('churnguard_token', data.token);
      localStorage.setItem('churnguard_user', JSON.stringify(data.user));
      dispatch({ type: 'AUTH_SUCCESS', payload: data });
      return data;
    } catch (err) {
      const message = err.response?.data?.message || 'Login failed. Please try again.';
      dispatch({ type: 'AUTH_ERROR', payload: message });
      throw new Error(message);
    }
  };

  const signup = async (data) => {
    dispatch({ type: 'AUTH_LOADING' });
    try {
      const result = await authService.signup(data);
      localStorage.setItem('churnguard_token', result.token);
      localStorage.setItem('churnguard_user', JSON.stringify(result.user));
      dispatch({ type: 'AUTH_SUCCESS', payload: result });
      return result;
    } catch (err) {
      const message = err.response?.data?.message || 'Signup failed. Please try again.';
      dispatch({ type: 'AUTH_ERROR', payload: message });
      throw new Error(message);
    }
  };

  const logout = async () => {
    await authService.logout();
    dispatch({ type: 'AUTH_LOGOUT' });
  };

  return (
    <AuthContext.Provider value={{ ...state, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
