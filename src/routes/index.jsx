import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../layouts/AuthLayout';
import AppLayout from '../layouts/AppLayout';

// Lazy load all pages
const LandingPage = lazy(() => import('../pages/LandingPage'));
const LoginPage = lazy(() => import('../pages/auth/LoginPage'));
const SignupPage = lazy(() => import('../pages/auth/SignupPage'));
const ForgotPasswordPage = lazy(() => import('../pages/auth/ForgotPasswordPage'));
const DashboardPage = lazy(() => import('../pages/DashboardPage'));
const CustomersPage = lazy(() => import('../pages/CustomersPage'));
const CustomerDetailPage = lazy(() => import('../pages/CustomerDetailPage'));
const AnalyticsPage = lazy(() => import('../pages/AnalyticsPage'));
const ExplainabilityPage = lazy(() => import('../pages/ExplainabilityPage'));
const RecommendationsPage = lazy(() => import('../pages/RecommendationsPage'));
const OutreachPage = lazy(() => import('../pages/OutreachPage'));
const SimulatorPage = lazy(() => import('../pages/SimulatorPage'));
const DataManagementPage = lazy(() => import('../pages/DataManagementPage'));
const AIAssistantPage = lazy(() => import('../pages/AIAssistantPage'));
const SettingsPage = lazy(() => import('../pages/SettingsPage'));
const ExecutiveOverviewPage = lazy(() => import('../pages/ExecutiveOverviewPage'));
const PlaybooksPage = lazy(() => import('../pages/PlaybooksPage'));
const CreateAutomationPage = lazy(() => import('../pages/CreateAutomationPage'));
const OnboardingPage = lazy(() => import('../pages/OnboardingPage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-border border-t-accent animate-spin" />
        <p className="text-xs text-text-tertiary">Loading...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

// Same auth guard as ProtectedRoute, but renders full-screen without the
// sidebar/app chrome — used for onboarding, which is its own flow.
function BareProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function AuthRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return children;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Suspense fallback={<PageLoader />}><LandingPage /></Suspense>,
  },
  {
    element: <AuthRoute><AuthLayout /></AuthRoute>,
    children: [
      { path: '/login', element: <Suspense fallback={<PageLoader />}><LoginPage /></Suspense> },
      { path: '/signup', element: <Suspense fallback={<PageLoader />}><SignupPage /></Suspense> },
      { path: '/forgot-password', element: <Suspense fallback={<PageLoader />}><ForgotPasswordPage /></Suspense> },
    ],
  },
  {
    path: '/onboarding',
    element: (
      <BareProtectedRoute>
        <Suspense fallback={<PageLoader />}>
          <OnboardingPage />
        </Suspense>
      </BareProtectedRoute>
    ),
  },
  ...[
    { path: '/dashboard', Page: DashboardPage },
    { path: '/customers', Page: CustomersPage },
    { path: '/customers/:id', Page: CustomerDetailPage },
    { path: '/analytics', Page: AnalyticsPage },
    { path: '/explainability', Page: ExplainabilityPage },
    { path: '/recommendations', Page: RecommendationsPage },
    { path: '/outreach', Page: OutreachPage },
    { path: '/simulator', Page: SimulatorPage },
    { path: '/data-management', Page: DataManagementPage },
    { path: '/ai-assistant', Page: AIAssistantPage },
    { path: '/playbooks', Page: PlaybooksPage },
    { path: '/playbooks/new', Page: CreateAutomationPage },
    { path: '/settings', Page: SettingsPage },
    { path: '/executive', Page: ExecutiveOverviewPage },
  ].map(({ path, Page }) => ({
    path,
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageLoader />}>
          <Page />
        </Suspense>
      </ProtectedRoute>
    ),
  })),
  {
    path: '*',
    element: <Suspense fallback={<PageLoader />}><NotFoundPage /></Suspense>,
  },
]);
