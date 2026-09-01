import { lazy, Suspense } from 'react';
import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AdminExperienceLayout } from './layouts/AdminExperienceLayout';
import { StudentExperienceLayout } from './layouts/StudentExperienceLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthRedirect } from './components/AuthRedirect';
import { LoginPage } from './pages/LoginPage';
import { SetupWizardPage } from './pages/SetupWizardPage';
import { QuickBiteLogo } from './components/brand/QuickBiteLogo';
const RegisterPage = lazy(() => import('./pages/RegisterPage').then((m) => ({ default: m.RegisterPage })));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })));
const AccountTypeChoicePage = lazy(() => import('./pages/AccountTypeChoicePage').then((m) => ({ default: m.AccountTypeChoicePage })));
const StudentRegisterPage = lazy(() => import('./pages/student/StudentRegisterPage').then((m) => ({ default: m.StudentRegisterPage })));
const ParentRegisterPage = lazy(() => import('./pages/ParentRegisterPage').then((m) => ({ default: m.ParentRegisterPage })));
const ParentFamilyPage = lazy(() => import('./pages/ParentFamilyPage').then((m) => ({ default: m.ParentFamilyPage })));
const OrderVerificationPage = lazy(() => import('./pages/OrderVerificationPage').then((m) => ({ default: m.OrderVerificationPage })));
const StudentFeatureCenter = lazy(() => import('./pages/student/StudentFeatureCenter').then((m) => ({ default: m.StudentFeatureCenter })));
const StudentAccountFeaturesPage = lazy(() => import('./pages/student/StudentAccountFeaturesPage').then((m) => ({ default: m.StudentAccountFeaturesPage })));
const StudentHistoryPage = lazy(() => import('./pages/student/StudentHistoryPage').then((m) => ({ default: m.StudentHistoryPage })));
const StudentRewardsPage = lazy(() => import('./pages/student/StudentRewardsPage').then((m) => ({ default: m.StudentRewardsPage })));
const StudentNotificationsPage = lazy(() => import('./pages/student/StudentNotificationsPage').then((m) => ({ default: m.StudentNotificationsPage })));
const StudentFavoritesPage = lazy(() => import('./pages/student/StudentFavoritesPage').then((m) => ({ default: m.StudentFavoritesPage })));
const StudentLinkCodePage = lazy(() => import('./pages/student/StudentLinkCodePage').then((m) => ({ default: m.StudentLinkCodePage })));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders').then((m) => ({ default: m.AdminOrders })));
const AdminPayments = lazy(() => import('./pages/admin/AdminPayments').then((m) => ({ default: m.AdminPayments })));
const AdminInventory = lazy(() => import('./pages/admin/AdminInventory').then((m) => ({ default: m.AdminInventory })));
const AdminMenu = lazy(() => import('./pages/admin/AdminMenu').then((m) => ({ default: m.AdminMenu })));
const AdminVerification = lazy(() => import('./pages/admin/AdminVerification').then((m) => ({ default: m.AdminVerification })));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers').then((m) => ({ default: m.AdminUsers })));
const AdminLoyalty = lazy(() => import('./pages/admin/AdminLoyalty').then((m) => ({ default: m.AdminLoyalty })));
const AdminReports = lazy(() => import('./pages/admin/AdminReports').then((m) => ({ default: m.AdminReports })));
const AdminHistory = lazy(() => import('./pages/admin/AdminHistory').then((m) => ({ default: m.AdminHistory })));
const AdminSystem = lazy(() => import('./pages/admin/AdminSystem').then((m) => ({ default: m.AdminSystem })));
const AdminWalletTopups = lazy(() => import('./pages/admin/AdminWalletTopups').then((m) => ({ default: m.AdminWalletTopups })));
const AdminResetPage = lazy(() => import('./pages/admin/AdminResetPage').then((m) => ({ default: m.AdminResetPage })));
const QuickBiteFeatureCenter = lazy(() => import('./pages/admin/QuickBiteFeatureCenter').then((m) => ({ default: m.QuickBiteFeatureCenter })));
function PageLoader() { return <div className="grid min-h-screen place-items-center bg-slate-50 text-sm font-bold text-slate-600"><div className="flex flex-col items-center gap-3"><QuickBiteLogo className="h-16 w-16 rounded-2xl" /><span>Cargando...</span></div></div>; }
function lazyPage(Component: ComponentType) { return <Suspense fallback={<PageLoader />}><Component /></Suspense>; }
export const router = createBrowserRouter([
  { path: '/', element: <LoginPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register-student', element: lazyPage(AccountTypeChoicePage) },
  { path: '/register-student/form', element: lazyPage(StudentRegisterPage) },
  { path: '/register-parent', element: lazyPage(ParentRegisterPage) },
  { path: '/parent/family', element: lazyPage(ParentFamilyPage) },
  { path: '/verify-order', element: lazyPage(OrderVerificationPage) },
  { path: '/menu', element: <StudentExperienceLayout /> },
  { path: '/student/features', element: lazyPage(StudentFeatureCenter) },
  { path: '/student/account', element: lazyPage(StudentAccountFeaturesPage) },
  { path: '/student/history', element: lazyPage(StudentHistoryPage) },
  { path: '/student/rewards', element: lazyPage(StudentRewardsPage) },
  { path: '/student/favorites', element: lazyPage(StudentFavoritesPage) },
  { path: '/student/link-code', element: lazyPage(StudentLinkCodePage) },
  { path: '/student/notifications', element: lazyPage(StudentNotificationsPage) },
  { path: '/register', element: <AuthRedirect><Suspense fallback={<PageLoader />}><RegisterPage /></Suspense></AuthRedirect> },
  { path: '/forgot-password', element: lazyPage(ForgotPasswordPage) },
  { path: '/reset-password', element: lazyPage(ResetPasswordPage) },
  { path: '/setup', element: <SetupWizardPage /> },
  { path: '/admin', element: <ProtectedRoute><AdminExperienceLayout /></ProtectedRoute>, children: [
    { index: true, element: lazyPage(AdminDashboard) },
    { path: 'features', element: lazyPage(QuickBiteFeatureCenter) },
    { path: 'orders', element: lazyPage(AdminOrders) },
    { path: 'payments', element: lazyPage(AdminPayments) },
    { path: 'wallet', element: lazyPage(AdminWalletTopups) },
    { path: 'inventory', element: lazyPage(AdminInventory) },
    { path: 'menu', element: lazyPage(AdminMenu) },
    { path: 'verification', element: lazyPage(AdminVerification) },
    { path: 'users', element: lazyPage(AdminUsers) },
    { path: 'loyalty', element: lazyPage(AdminLoyalty) },
    { path: 'reports', element: lazyPage(AdminReports) },
    { path: 'history', element: lazyPage(AdminHistory) },
    { path: 'system', element: lazyPage(AdminSystem) },
    { path: 'reset', element: lazyPage(AdminResetPage) },
  ] },
  { path: '*', element: <Navigate to="/" replace /> },
]);
