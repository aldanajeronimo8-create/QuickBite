import { lazy, Suspense } from 'react';
import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AdminExperienceLayout } from './layouts/AdminExperienceLayout';
import { StudentExperienceLayout } from './layouts/StudentExperienceLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminProtectedDataGate } from './components/AdminProtectedDataGate';
import { RoleProtectedRoute } from './components/RoleProtectedRoute';
import { AuthRedirect } from './components/AuthRedirect';
import { LoginPage } from './pages/LoginPage';
import { SetupWizardPage } from './pages/SetupWizardPage';
import { QuickBiteLogo } from './components/brand/QuickBiteLogo';
import { StudentFeatureCenter } from './pages/student/StudentFeatureCenter';
import { StudentAccountFeaturesPage } from './pages/student/StudentAccountFeaturesPage';
import { StudentWalletPage } from './pages/student/StudentWalletPage';
import { StudentHistoryPage } from './pages/student/StudentHistoryPage';
import { StudentRewardsPage } from './pages/student/StudentRewardsPage';
import { StudentNotificationsPage } from './pages/student/StudentNotificationsPage';
import { StudentFavoritesPage } from './pages/student/StudentFavoritesPage';
import { StudentLinkCodePage } from './pages/student/StudentLinkCodePage';
import { AdminWalletTopups } from './pages/admin/AdminWalletTopups';
const RegisterPage = lazy(() => import('./pages/RegisterPage').then((m) => ({ default: m.RegisterPage })));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })));
const AccountTypeChoicePage = lazy(() => import('./pages/AccountTypeChoicePage').then((m) => ({ default: m.AccountTypeChoicePage })));
const StudentRegisterPage = lazy(() => import('./pages/student/StudentRegisterPage').then((m) => ({ default: m.StudentRegisterPage })));
const ParentRegisterPage = lazy(() => import('./pages/ParentRegisterPage').then((m) => ({ default: m.ParentRegisterPage })));
const ParentFamilyPage = lazy(() => import('./pages/ParentFamilyPage').then((m) => ({ default: m.ParentFamilyPage })));
const OrderVerificationPage = lazy(() => import('./pages/OrderVerificationPage').then((m) => ({ default: m.OrderVerificationPage })));
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
const AdminResetPage = lazy(() => import('./pages/admin/AdminResetPage').then((m) => ({ default: m.AdminResetPage })));
const AdminOperations = lazy(() => import('./pages/admin/AdminOperations').then((m) => ({ default: m.AdminOperations })));
const QuickBiteFeatureCenter = lazy(() => import('./pages/admin/QuickBiteFeatureCenter').then((m) => ({ default: m.QuickBiteFeatureCenter })));
function PageLoader() { return <div className="grid min-h-screen place-items-center bg-slate-50 text-sm font-bold text-slate-600"><div className="flex flex-col items-center gap-3"><QuickBiteLogo className="h-16 w-16 rounded-2xl" /><span>Cargando...</span></div></div>; }
function lazyPage(Component: ComponentType) { return <Suspense fallback={<PageLoader />}><Component /></Suspense>; }
export const router = createBrowserRouter([
  { path: '/', element: <LoginPage /> }, { path: '/login', element: <LoginPage /> }, { path: '/register-student', element: lazyPage(AccountTypeChoicePage) }, { path: '/register-student/form', element: lazyPage(StudentRegisterPage) }, { path: '/register-parent', element: lazyPage(ParentRegisterPage) }, { path: '/parent/family', element: <RoleProtectedRoute role="parent">{lazyPage(ParentFamilyPage)}</RoleProtectedRoute> }, { path: '/verify-order', element: lazyPage(OrderVerificationPage) },
  { path: '/menu', element: <RoleProtectedRoute role="student"><StudentExperienceLayout /></RoleProtectedRoute> }, { path: '/student/features', element: <RoleProtectedRoute role="student"><StudentFeatureCenter /></RoleProtectedRoute> }, { path: '/student/account', element: <RoleProtectedRoute role="student"><StudentAccountFeaturesPage /></RoleProtectedRoute> }, { path: '/student/wallet', element: <RoleProtectedRoute role="student"><StudentWalletPage /></RoleProtectedRoute> }, { path: '/student/history', element: <RoleProtectedRoute role="student"><StudentHistoryPage /></RoleProtectedRoute> }, { path: '/student/rewards', element: <RoleProtectedRoute role="student"><StudentRewardsPage /></RoleProtectedRoute> }, { path: '/student/favorites', element: <RoleProtectedRoute role="student"><StudentFavoritesPage /></RoleProtectedRoute> }, { path: '/student/link-code', element: <RoleProtectedRoute role="student"><StudentLinkCodePage /></RoleProtectedRoute> }, { path: '/student/notifications', element: <RoleProtectedRoute role="student"><StudentNotificationsPage /></RoleProtectedRoute> },
  { path: '/register', element: <AuthRedirect><Suspense fallback={<PageLoader />}><RegisterPage /></Suspense></AuthRedirect> }, { path: '/forgot-password', element: lazyPage(ForgotPasswordPage) }, { path: '/reset-password', element: lazyPage(ResetPasswordPage) }, { path: '/setup', element: <SetupWizardPage /> },
  { path: '/admin', element: <ProtectedRoute><AdminProtectedDataGate><AdminExperienceLayout /></AdminProtectedDataGate></ProtectedRoute>, children: [ { index: true, element: lazyPage(AdminDashboard) }, { path: 'features', element: lazyPage(QuickBiteFeatureCenter) }, { path: 'operations', element: lazyPage(AdminOperations) }, { path: 'rankings', element: lazyPage(AdminOperations) }, { path: 'orders', element: lazyPage(AdminOrders) }, { path: 'payments', element: lazyPage(AdminPayments) }, { path: 'wallet', element: lazyPage(AdminWalletTopups) }, { path: 'inventory', element: lazyPage(AdminInventory) }, { path: 'menu', element: lazyPage(AdminMenu) }, { path: 'verification', element: lazyPage(AdminVerification) }, { path: 'users', element: lazyPage(AdminUsers) }, { path: 'loyalty', element: lazyPage(AdminLoyalty) }, { path: 'reports', element: lazyPage(AdminReports) }, { path: 'history', element: lazyPage(AdminHistory) }, { path: 'system', element: lazyPage(AdminSystem) }, { path: 'reset', element: lazyPage(AdminResetPage) } ] },
  { path: '*', element: <Navigate to="/" replace /> },
]);