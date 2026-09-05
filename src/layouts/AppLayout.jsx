import { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Users, BarChart3, Brain, Lightbulb, Mail, SlidersHorizontal,
  Database, MessageSquare, Settings, ChevronLeft, Shield, Presentation, LogOut,
  Search, Bell, HelpCircle, Menu, X, Sparkles, Zap
} from 'lucide-react';
import { cn } from '../utils/helpers';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import Avatar from '../components/ui/Avatar';
import NotificationPanel from '../features/notifications/NotificationPanel';
import SearchCommand from '../components/SearchCommand';
import ToastContainer from '../components/ui/Toast';
import FloatingChatWidget from '../components/ui/FloatingChatWidget';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Overview' },
  { to: '/customers', icon: Users, label: 'Customers' },
  { to: '/analytics', icon: BarChart3, label: 'Risk Analytics' },
  { to: '/explainability', icon: Brain, label: 'Explainability' },
  { to: '/recommendations', icon: Lightbulb, label: 'Recommendations' },
  { to: '/outreach', icon: Mail, label: 'Outreach' },
  { to: '/simulator', icon: SlidersHorizontal, label: 'What-If Simulator' },
  { to: '/data-management', icon: Database, label: 'Data Management' },
  { to: '/playbooks', icon: Zap, label: 'Playbooks' },
  { to: '/ai-assistant', icon: MessageSquare, label: 'AI Assistant' },
];

const bottomItems = [
  { to: '/executive', icon: Presentation, label: 'Executive View' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const { sidebarCollapsed, presentationMode, demoMode, unreadCount, dispatch, searchOpen } = useApp();
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        dispatch({ type: 'TOGGLE_SEARCH' });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (presentationMode) {
    return (
      <div className="min-h-screen bg-bg-primary">
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-bg-secondary">
          <div className="flex items-center gap-3">
            <Shield size={20} className="text-accent" />
            <span className="text-sm font-bold tracking-wider text-text-primary">CHURNGUARD</span>
          </div>
          <div className="flex items-center gap-3">
            {demoMode && (
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-accent/10 text-accent border border-accent/20">
                DEMO
              </span>
            )}
            <button
              onClick={() => dispatch({ type: 'TOGGLE_PRESENTATION' })}
              className="text-xs text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
            >
              Exit Presentation
            </button>
          </div>
        </div>
        <main className="p-6">{children}</main>
        <ToastContainer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary flex">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 h-full bg-bg-secondary border-r border-border z-40 transition-all duration-300 flex flex-col',
          sidebarCollapsed ? 'w-16' : 'w-60',
          'max-lg:hidden'
        )}
      >
        {/* Logo */}
        <div className={cn('flex items-center h-14 px-4 border-b border-border', sidebarCollapsed ? 'justify-center' : 'gap-3')}>
          <div className="w-7 h-7 rounded-lg gradient-accent flex items-center justify-center shrink-0">
            <Shield size={14} className="text-bg-primary" />
          </div>
          {!sidebarCollapsed && (
            <div>
              <div className="text-xs font-bold tracking-wider text-text-primary">CHURNGUARD</div>
              <div className="text-[9px] text-text-tertiary tracking-wider">RETENTION AI</div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                  sidebarCollapsed && 'justify-center px-2',
                  isActive
                    ? 'bg-accent/10 text-accent'
                    : 'text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary'
                )
              }
              title={sidebarCollapsed ? item.label : undefined}
            >
              <item.icon size={18} className="shrink-0" />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Bottom items */}
        <div className="py-3 px-2 space-y-0.5 border-t border-border">
          {bottomItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                  sidebarCollapsed && 'justify-center px-2',
                  isActive
                    ? 'bg-accent/10 text-accent'
                    : 'text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary'
                )
              }
              title={sidebarCollapsed ? item.label : undefined}
            >
              <item.icon size={18} className="shrink-0" />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </NavLink>
          ))}

          <button
            onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 w-full cursor-pointer',
              'text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary',
              sidebarCollapsed && 'justify-center px-2'
            )}
          >
            <ChevronLeft size={18} className={cn('shrink-0 transition-transform', sidebarCollapsed && 'rotate-180')} />
            {!sidebarCollapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="fixed top-0 left-0 right-0 h-14 bg-bg-secondary border-b border-border z-30 lg:hidden flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setMobileMenuOpen(true)} className="p-1.5 text-text-secondary cursor-pointer">
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-accent" />
            <span className="text-xs font-bold tracking-wider">CHURNGUARD</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => dispatch({ type: 'TOGGLE_SEARCH' })} className="p-1.5 text-text-tertiary cursor-pointer">
            <Search size={18} />
          </button>
          <button onClick={() => setNotifOpen(!notifOpen)} className="p-1.5 text-text-tertiary relative cursor-pointer">
            <Bell size={18} />
            {unreadCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-risk-critical text-[9px] text-white flex items-center justify-center font-bold">{unreadCount}</span>}
          </button>
        </div>
      </div>

      {/* Mobile menu overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50 lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed top-0 left-0 h-full w-64 bg-bg-secondary border-r border-border z-50 lg:hidden flex flex-col"
            >
              <div className="flex items-center justify-between h-14 px-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <Shield size={16} className="text-accent" />
                  <span className="text-xs font-bold tracking-wider">CHURNGUARD</span>
                </div>
                <button onClick={() => setMobileMenuOpen(false)} className="p-1 text-text-tertiary cursor-pointer"><X size={18} /></button>
              </div>
              <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
                {navItems.map((item) => (
                  <NavLink key={item.to} to={item.to} className={({ isActive }) => cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium', isActive ? 'bg-accent/10 text-accent' : 'text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary')}>
                    <item.icon size={18} /> <span>{item.label}</span>
                  </NavLink>
                ))}
              </nav>
              <div className="py-3 px-2 space-y-0.5 border-t border-border">
                {bottomItems.map((item) => (
                  <NavLink key={item.to} to={item.to} className={({ isActive }) => cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium', isActive ? 'bg-accent/10 text-accent' : 'text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary')}>
                    <item.icon size={18} /> <span>{item.label}</span>
                  </NavLink>
                ))}
                <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-text-tertiary hover:text-risk-critical w-full cursor-pointer">
                  <LogOut size={18} /> <span>Log Out</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main content area */}
      <div className={cn('flex-1 flex flex-col transition-all duration-300', sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-60')}>
        {/* Top navbar */}
        <header className="sticky top-0 z-20 h-14 border-b border-border bg-bg-secondary/80 backdrop-blur-sm max-lg:hidden">
          <div className="flex items-center justify-between h-full px-6">
            <button
              onClick={() => dispatch({ type: 'TOGGLE_SEARCH' })}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-tertiary/50 border border-border text-text-tertiary text-sm hover:border-border-light transition-colors w-64 cursor-pointer"
            >
              <Search size={14} />
              <span className="text-xs">Search customers, IDs...</span>
              <kbd className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary font-mono">⌘K</kbd>
            </button>

            <div className="flex items-center gap-1">
              {demoMode && (
                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-accent/10 text-accent border border-accent/20 mr-2">
                  DEMO
                </span>
              )}
              <button
                onClick={() => dispatch({ type: 'TOGGLE_PRESENTATION' })}
                className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
                title="Presentation Mode"
              >
                <Presentation size={16} />
              </button>
              <button
                onClick={() => navigate('/ai-assistant')}
                className="p-2 rounded-lg text-text-tertiary hover:text-accent hover:bg-accent/5 transition-colors cursor-pointer"
                title="AI Assistant"
              >
                <Sparkles size={16} />
              </button>
              <button className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer" title="Help">
                <HelpCircle size={16} />
              </button>
              <div className="relative">
                <button
                  onClick={() => setNotifOpen(!notifOpen)}
                  className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors relative cursor-pointer"
                  title="Notifications"
                >
                  <Bell size={16} />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-risk-critical text-[9px] text-white flex items-center justify-center font-bold">
                      {unreadCount}
                    </span>
                  )}
                </button>
                <NotificationPanel isOpen={notifOpen} onClose={() => setNotifOpen(false)} />
              </div>
              <div className="w-px h-6 bg-border mx-2" />
              <button
                onClick={() => navigate('/settings')}
                className="flex items-center gap-2.5 px-2 py-1 rounded-lg hover:bg-bg-tertiary transition-colors cursor-pointer"
              >
                <Avatar name={user?.name} size="sm" />
                <div className="text-left hidden xl:block">
                  <div className="text-xs font-medium text-text-primary">{user?.name}</div>
                  <div className="text-[10px] text-text-tertiary">{user?.company || 'ChurnGuard'}</div>
                </div>
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 max-lg:pt-20 overflow-x-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              // `mode="wait"` runs exit before enter, so keep the exit short —
              // it's pure dead time on every navigation.
              transition={{ duration: 0.15, exit: { duration: 0.08 } }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Search command palette */}
      <SearchCommand isOpen={searchOpen} onClose={() => dispatch({ type: 'SET_SEARCH', payload: false })} />

      {/* Toast notifications */}
      <ToastContainer />

      {/* Floating Chat */}
      {!presentationMode && <FloatingChatWidget />}
    </div>
  );
}
