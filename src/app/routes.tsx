import { lazy, Suspense } from 'react';
import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AdminLayoutFixed } from './layouts/AdminLayoutFixed';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthRedirect } from './components/AuthRedirect';
import { LoginPage } from './pages/LoginPage';
import { SetupWizardPage } from './pages/SetupWizardPage';
import { QuickBiteLogo } from './components/brand/QuickBiteLogo';
import { StudentPlatformBridge } from './components/student/StudentPlatformBridge';
import { StudentOrderRealtimeBridge } from './components/student/StudentOrderRealtimeBridge';
const RegisterPage = lazy(() => import('./pages/RegisterPage').then(m => ({default:m.RegisterPage})));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage').then(m => ({default:m.ForgotPasswordPage})));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage').then(m => ({default:m.ResetPasswordPage})));
const StudentRegisterPage = lazy(() => import('./pages/student/StudentRegisterPage').then(m => ({default:m.StudentRegisterPage})));
const StudentMenuPage = lazy(() => import('./pages/student/StudentMenuPage').then(m => ({default:m.StudentMenuPage})));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard').then(m => ({default:m.AdminDashboard})));
const AdminOrdersFixed = lazy(() => import('./pages/admin/AdminOrdersFixed').then(m => ({default:m.AdminOrdersFixed})));
const AdminPaymentsFixed = lazy(() => import('./pages/admin/AdminPaymentsFixed').then(m => ({default:m.AdminPaymentsFixed})));
const AdminReportsFixed = lazy(() => import('./pages/admin/AdminReportsFixed').then(m => ({default:m.AdminReportsFixed})));
const AdminInventory = lazy(() => import('./pages/admin/AdminInventory').then(m => ({default:m.AdminInventory})));
const AdminMenu = lazy(() => import('./pages/admin/AdminMenu').then(m => ({default:m.AdminMenu})));
const AdminVerification = lazy(() => import('./pages/admin/AdminVerification').then(m => ({default:m.AdminVerification})));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers').then(m => ({default:m.AdminUsers})));
const AdminLoyalty = lazy(() => import('./pages/admin/AdminLoyalty').then(m => ({default:m.AdminLoyalty})));
const AdminAutomation = lazy(() => import('./pages/admin/AdminAutomation').then(m => ({default:m.AdminAutomation})));
function PageLoader(){return <div className="grid min-h-screen place-items-center bg-slate-50 text-sm font-bold text-slate-600"><div className="flex flex-col items-center gap-3"><QuickBiteLogo className="h-16 w-16 rounded-2xl"/><span>Cargando...</span></div></div>}
function lazyPage(Component: ComponentType){return <Suspense fallback={<PageLoader/>}><Component/></Suspense>}
function StudentMenuRoute(){return <><>{lazyPage(StudentMenuPage)}</><StudentPlatformBridge/><StudentOrderRealtimeBridge/></>}
export const router=createBrowserRouter([
 {path:'/',element:<LoginPage/>},{path:'/login',element:<LoginPage/>},{path:'/register-student',element:lazyPage(StudentRegisterPage)},{path:'/menu',element:<StudentMenuRoute/>},
 {path:'/register',element:<AuthRedirect><Suspense fallback={<PageLoader/>}><RegisterPage/></Suspense></AuthRedirect>},{path:'/forgot-password',element:lazyPage(ForgotPasswordPage)},{path:'/reset-password',element:lazyPage(ResetPasswordPage)},{path:'/setup',element:<SetupWizardPage/>},
 {path:'/admin',element:<ProtectedRoute><AdminLayoutFixed/></ProtectedRoute>,children:[
  {index:true,element:lazyPage(AdminDashboard)},{path:'orders',element:lazyPage(AdminOrdersFixed)},{path:'payments',element:lazyPage(AdminPaymentsFixed)},{path:'reports',element:lazyPage(AdminReportsFixed)},
  {path:'inventory',element:lazyPage(AdminInventory)},{path:'menu',element:lazyPage(AdminMenu)},{path:'verification',element:lazyPage(AdminVerification)},{path:'users',element:lazyPage(AdminUsers)},{path:'loyalty',element:lazyPage(AdminLoyalty)},{path:'automation',element:lazyPage(AdminAutomation)}
 ]},{path:'*',element:<Navigate to="/" replace/>}
]);
