// ============================================
// ChurnGuard – App Context (UI & Global State)
// ============================================

import { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';
import {
  DEFAULT_THEME,
  applyResolvedTheme,
  isThemePreference,
  prefersDarkScheme,
  readStoredTheme,
  resolveTheme,
  writeStoredTheme,
} from '../utils/theme';

const AppContext = createContext(null);

// Connecting a dataset is the first required step after signing in, and the
// completion state has to survive a page refresh or a component remount —
// otherwise a user who finished onboarding gets thrown back into it. It is
// stored under one key, written from one place (below), and scoped to the
// signed-in user so logging out or switching accounts starts setup fresh.
const DATASET_SETUP_KEY = 'churnguard_dataset_setup';

function readStoredSetup() {
  try {
    const raw = localStorage.getItem(DATASET_SETUP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // Private mode / disabled storage — setup simply won't persist.
    return null;
  }
}

function writeStoredSetup(record) {
  try {
    if (record) localStorage.setItem(DATASET_SETUP_KEY, JSON.stringify(record));
    else localStorage.removeItem(DATASET_SETUP_KEY);
  } catch {
    // Non-fatal: the in-memory state below still drives this session.
  }
}

const initialState = {
  sidebarCollapsed: false,
  presentationMode: false,
  selectedDateRange: '30d',
  selectedSegment: 'all',
  notifications: [],
  unreadCount: 0,
  searchOpen: false,
  toasts: [],
  // Dataset setup gate — see routes/index.jsx and DataManagementPage.
  datasetSetupComplete: false,
  activeDataset: null,
  // False until the stored record has been read back (or ruled out). The route
  // guard waits for this: auth rehydrates one render before this effect runs,
  // and judging the gate in that gap would bounce a user who has already
  // completed setup straight back into it on every refresh.
  datasetSetupHydrated: false,
  // Appearance. `theme` is what the user chose ('light' | 'dark' | 'system');
  // `resolvedTheme` is what is actually rendered. THE one theme state — the
  // header control and Settings → Appearance both read and write this.
  theme: DEFAULT_THEME,
  resolvedTheme: 'dark',
};

function appReducer(state, action) {
  switch (action.type) {
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
    case 'SET_SIDEBAR':
      return { ...state, sidebarCollapsed: action.payload };
    case 'TOGGLE_PRESENTATION':
      return { ...state, presentationMode: !state.presentationMode };
    case 'SET_DATE_RANGE':
      return { ...state, selectedDateRange: action.payload };
    case 'SET_SEGMENT':
      return { ...state, selectedSegment: action.payload };
    case 'SET_NOTIFICATIONS':
      return { ...state, notifications: action.payload, unreadCount: action.payload.filter(n => !n.read).length };
    case 'MARK_NOTIFICATION_READ':
      return {
        ...state,
        notifications: state.notifications.map(n => n.id === action.payload ? { ...n, read: true } : n),
        unreadCount: Math.max(0, state.unreadCount - 1),
      };
    case 'MARK_ALL_READ':
      return { ...state, notifications: state.notifications.map(n => ({ ...n, read: true })), unreadCount: 0 };
    case 'TOGGLE_SEARCH':
      return { ...state, searchOpen: !state.searchOpen };
    case 'SET_SEARCH':
      return { ...state, searchOpen: action.payload };
    case 'ADD_TOAST':
      return { ...state, toasts: [...state.toasts, { id: Date.now(), ...action.payload }] };
    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.payload) };
    case 'SET_DATASET_SETUP':
      return {
        ...state,
        datasetSetupComplete: Boolean(action.payload),
        activeDataset: action.payload || null,
        datasetSetupHydrated: true,
      };
    case 'SET_THEME':
      return { ...state, theme: action.payload.theme, resolvedTheme: action.payload.resolved };
    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const userKey = user?.email || null;

  // Restore (or clear) the dataset-setup record whenever the signed-in user
  // resolves. Waiting for `authLoading` matters: on a refresh the user is
  // momentarily null while auth rehydrates, and clearing then would drop a
  // completed setup for no reason.
  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated || !userKey) {
      writeStoredSetup(null);
      dispatch({ type: 'SET_DATASET_SETUP', payload: null });
      return;
    }

    const stored = readStoredSetup();
    if (stored && stored.userKey === userKey) {
      dispatch({ type: 'SET_DATASET_SETUP', payload: stored });
    } else {
      // A different account's record — start setup fresh rather than inheriting it.
      writeStoredSetup(null);
      dispatch({ type: 'SET_DATASET_SETUP', payload: null });
    }
  }, [authLoading, isAuthenticated, userKey]);

  // ---------------------------------------------------------- appearance --
  //
  // One setting, one owner. The header control and Settings → Appearance both
  // call `setTheme` below; nothing else reads or writes the stored preference
  // (index.html's pre-paint bootstrap is the single documented exception, and
  // it only reads). The resolved value lands on <html data-theme>, which is
  // what src/index.css keys the whole palette off.
  useEffect(() => {
    const stored = readStoredTheme();
    const resolved = resolveTheme(stored, prefersDarkScheme());
    applyResolvedTheme(resolved);
    dispatch({ type: 'SET_THEME', payload: { theme: stored, resolved } });
  }, []);

  // "System" has to keep following the OS after the page has loaded.
  useEffect(() => {
    if (state.theme !== 'system' || typeof window === 'undefined' || !window.matchMedia) return undefined;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = (event) => {
      const resolved = resolveTheme('system', event.matches);
      applyResolvedTheme(resolved);
      dispatch({ type: 'SET_THEME', payload: { theme: 'system', resolved } });
    };
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, [state.theme]);

  const setTheme = useCallback((preference) => {
    const next = isThemePreference(preference) ? preference : DEFAULT_THEME;
    const resolved = resolveTheme(next, prefersDarkScheme());
    writeStoredTheme(next);
    applyResolvedTheme(resolved);
    dispatch({ type: 'SET_THEME', payload: { theme: next, resolved } });
  }, []);

  const addToast = useCallback((toast) => {
    const id = Date.now();
    dispatch({ type: 'ADD_TOAST', payload: { ...toast, id } });
    setTimeout(() => dispatch({ type: 'REMOVE_TOAST', payload: id }), 5000);
  }, []);

  /** Called once the dataset has been uploaded, validated, mapped and processed. */
  const completeDatasetSetup = useCallback((summary) => {
    const record = { ...summary, userKey, completedAt: new Date().toISOString() };
    writeStoredSetup(record);
    dispatch({ type: 'SET_DATASET_SETUP', payload: record });
    return record;
  }, [userKey]);

  /** "Replace dataset" — drops the completed setup and re-locks the workspace. */
  const resetDatasetSetup = useCallback(() => {
    writeStoredSetup(null);
    dispatch({ type: 'SET_DATASET_SETUP', payload: null });
  }, []);

  // The DEMO badge has to describe the data that is actually connected. It was
  // hardcoded `true`, so a user who uploaded their own customer export was told
  // they were looking at demo data — the exact mislabelling DataSourceBadge
  // exists to prevent, just in the other direction. Derived from the one
  // source of truth rather than tracked separately.
  const demoMode = Boolean(
    state.activeDataset && (state.activeDataset.source?.kind === 'demo' || state.activeDataset.isDemo)
  );

  return (
    <AppContext.Provider
      value={{
        ...state,
        demoMode,
        dispatch,
        addToast,
        completeDatasetSetup,
        resetDatasetSetup,
        setTheme,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
