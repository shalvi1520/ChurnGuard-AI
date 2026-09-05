// ============================================
// ChurnGuard – App Context (UI & Global State)
// ============================================

import { createContext, useContext, useReducer, useCallback } from 'react';

const AppContext = createContext(null);

const initialState = {
  sidebarCollapsed: false,
  presentationMode: false,
  demoMode: true,
  selectedDateRange: '30d',
  selectedSegment: 'all',
  notifications: [],
  unreadCount: 0,
  chatOpen: false,
  copilotOpen: false,
  copilotContext: null,
  searchOpen: false,
  toasts: [],
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
    case 'TOGGLE_CHAT':
      return { ...state, chatOpen: !state.chatOpen };
    case 'SET_CHAT':
      return { ...state, chatOpen: action.payload };
    case 'TOGGLE_COPILOT':
      return { ...state, copilotOpen: !state.copilotOpen };
    case 'SET_COPILOT_CONTEXT':
      return { ...state, copilotContext: action.payload };
    case 'TOGGLE_SEARCH':
      return { ...state, searchOpen: !state.searchOpen };
    case 'SET_SEARCH':
      return { ...state, searchOpen: action.payload };
    case 'ADD_TOAST':
      return { ...state, toasts: [...state.toasts, { id: Date.now(), ...action.payload }] };
    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.payload) };
    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const addToast = useCallback((toast) => {
    const id = Date.now();
    dispatch({ type: 'ADD_TOAST', payload: { ...toast, id } });
    setTimeout(() => dispatch({ type: 'REMOVE_TOAST', payload: id }), 5000);
  }, []);

  return (
    <AppContext.Provider value={{ ...state, dispatch, addToast }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
