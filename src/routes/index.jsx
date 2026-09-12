import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet, ScrollRestoration } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { requiresDatasetSetup } from './accessRules';
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
const ExplainabilityPage = lazy(() => import('../pages/ExplainabilityPage'));
const RecommendationsPage = lazy(() => import('../pages/RecommendationsPage'));
const OutreachPage = lazy(() => import('../pages/OutreachPage'));
const DataManagementPage = lazy(() => import('../pages/DataManagementPage'));
const HistoryPage = lazy(() => import('../pages/HistoryPage'));
const SettingsPage = lazy(() => import('../pages/SettingsPage'));
const ExecutiveOverviewPage = lazy(() => import('../pages/ExecutiveOverviewPage'));
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

// Connecting a dataset is the first required step of the product: without one
// there is nothing to show on Portfolio & Risk or any analysis page. Which paths
// are exempt lives in `accessRules.js` so the sidebar and this guard agree.
function ProtectedRoute({ children, requiresDataset = true }) {
  const { isAuthenticated, isLoading } = useAuth();
  const { datasetSetupComplete, datasetSetupHydrated } = useApp();
  if (isLoading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (requiresDataset) {
    if (!datasetSetupHydrated) return <PageLoader />;
    if (!datasetSetupComplete) return <Navigate to="/data-management" replace />;
  }
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
  const { datasetSetupComplete, datasetSetupHydrated } = useApp();
  if (isLoading) return <PageLoader />;
  if (!isAuthenticated) return children;
  if (!datasetSetupHydrated) return <PageLoader />;
  return <Navigate to={datasetSetupComplete ? '/dashboard' : '/data-management'} replace />;
}

// Scroll behaves like a normal website: a page you drill into starts at the
// top (the dashboard's CTA sits at the bottom, and without this Customers
// opened already scrolled down), and Back/Forward return to where you were.
// In-page filter changes opt out with `preventScrollReset`.
function RootLayout() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  );
}

export const router = createBrowserRouter([{ element: <RootLayout />, children: [
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
    { path: '/explainability', Page: ExplainabilityPage },
    { path: '/recommendations', Page: RecommendationsPage },
    { path: '/outreach', Page: OutreachPage },
    { path: '/data-management', Page: DataManagementPage },
    { path: '/history', Page: HistoryPage },
    { path: '/settings', Page: SettingsPage },
    { path: '/executive', Page: ExecutiveOverviewPage },
  ].map(({ path, Page }) => ({
    path,
    element: (
      <ProtectedRoute requiresDataset={requiresDatasetSetup(path)}>
        <Suspense fallback={<PageLoader />}>
          <Page />
        </Suspense>
      </ProtectedRoute>
    ),
  })),
  // Risk Analytics was folded into Portfolio & Risk (/dashboard). The old path
  // redirects so bookmarks and stale links land on the page that now holds
  // those charts; /dashboard applies the usual auth and dataset guards.
  { path: '/analytics', element: <Navigate to="/dashboard" replace /> },
  {
    path: '*',
    element: <Suspense fallback={<PageLoader />}><NotFoundPage /></Suspense>,
  },
] }]);
