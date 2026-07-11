import { lazy, Suspense } from 'react';
import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AdminLayout } from './layouts/AdminLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthRedirect } from './components/AuthRedirect';
import { LoginPage } from './pages/LoginPage';
import { SetupWizardPage } from './pages/SetupWizardPage';

const RegisterPage = lazy(() =>
  import('./pages/RegisterPage').then((m) => ({ default: m.RegisterPage })),
);
const ForgotPasswordPage = lazy(() =>
  import('./pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
);
const ResetPasswordPage = lazy(() =>
  import('./pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
);
const StudentRegisterPage = lazy(() =>
  import('./pages/student/StudentRegisterPage').then((m) => ({ default: m.StudentRegisterPage })),
);
const StudentMenuPage = lazy(() =>
  import('./pages/student/StudentMenuPage').then((m) => ({ default: m.StudentMenuPage })),
);
const AdminDashboard = lazy(() =>
  import('./pages/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard })),
);
const AdminOrders = lazy(() =>
  import('./pages/admin/AdminOrders').then((m) => ({ default: m.AdminOrders })),
);
const AdminPayments = lazy(() =>
  import('./pages/admin/AdminPayments').then((m) => ({ default: m.AdminPayments })),
);
const AdminInventory = lazy(() =>
  import('./pages/admin/AdminInventory').then((m) => ({ default: m.AdminInventory })),
);
const AdminMenu = lazy(() =>
  import('./pages/admin/AdminMenu').then((m) => ({ default: m.AdminMenu })),
);
const AdminVerification = lazy(() =>
  import('./pages/admin/AdminVerification').then((m) => ({ default: m.AdminVerification })),
);
const AdminUsers = lazy(() =>
  import('./pages/admin/AdminUsers').then((m) => ({ default: m.AdminUsers })),
);
const AdminStudents = lazy(() =>
  import('./pages/admin/AdminStudents').then((m) => ({ default: m.AdminStudents })),
);
const AdminLoyalty = lazy(() =>
  import('./pages/admin/AdminLoyalty').then((m) => ({ default: m.AdminLoyalty })),
);

function PageLoader() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#fff7e8] text-sm font-bold text-slate-600">
      Cargando...
    </div>
  );
}

function lazyPage(Component: ComponentType) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  // Unified login — root of the app
  { path: '/', element: <LoginPage /> },
  { path: '/login', element: <LoginPage /> },

  // Student routes
  { path: '/register-student', element: lazyPage(StudentRegisterPage) },
  {
    path: '/menu',
    element: (
      <ProtectedRoute allowedRoles={['student', 'admin', 'both']}>
        {lazyPage(StudentMenuPage)}
      </ProtectedRoute>
    ),
  },

  // Admin routes
  {
    path: '/register',
    element: (
      <AuthRedirect>
        <Suspense fallback={<PageLoader />}>
          <RegisterPage />
        </Suspense>
      </AuthRedirect>
    ),
  },
  { path: '/forgot-password', element: lazyPage(ForgotPasswordPage) },
  { path: '/reset-password', element: lazyPage(ResetPasswordPage) },
  { path: '/setup', element: <SetupWizardPage /> },
  {
    path: '/admin',
    element: (
      <ProtectedRoute allowedRoles={['admin', 'both']}>
        <AdminLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: lazyPage(AdminDashboard) },
      { path: 'orders', element: lazyPage(AdminOrders) },
      { path: 'payments', element: lazyPage(AdminPayments) },
      { path: 'inventory', element: lazyPage(AdminInventory) },
      { path: 'menu', element: lazyPage(AdminMenu) },
      { path: 'verification', element: lazyPage(AdminVerification) },
      { path: 'users', element: lazyPage(AdminUsers) },
      { path: 'students', element: lazyPage(AdminStudents) },
      { path: 'loyalty', element: lazyPage(AdminLoyalty) },
    ],
  },

  { path: '*', element: <Navigate to="/" replace /> },
]);
