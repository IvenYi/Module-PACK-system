import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import LoginPage from '@/pages/LoginPage';
import AppLayout from '@/components/shared/AppLayout';
import NotFoundPage from '@/pages/NotFoundPage';

const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'));
const PersonalSettingsPage = lazy(() => import('@/pages/account/PersonalSettingsPage'));
const PackManufacturingPage = lazy(() => import('@/pages/pack/PackManufacturingPage'));
const PackWorkOrderPage = lazy(() => import('@/pages/pack/PackWorkOrderPage'));
const PackObjectPage = lazy(() => import('@/pages/pack/PackObjectPage'));
const PackExecutionPage = lazy(() => import('@/pages/pack/PackExecutionPage'));
const PackQualityPage = lazy(() => import('@/pages/pack/PackQualityPage'));
const PackTracePage = lazy(() => import('@/pages/pack/PackTracePage'));
const PackIntegrationPage = lazy(() => import('@/pages/pack/PackIntegrationPage'));
const ProductionResourcePage = lazy(() => import('@/pages/master-data/ProductionResourcePage'));
const ProcessModelingPage = lazy(() => import('@/pages/master-data/ProcessModelingPage'));
const ProductModelingPage = lazy(() => import('@/pages/master-data/ProductModelingPage'));
const ProductModelingWorkspacePage = lazy(() => import('@/pages/master-data/ProductModelingWorkspacePage'));
const ProductFamilyModelingPage = lazy(() => import('@/pages/master-data/ProductFamilyModelingPage'));
const DocumentManagementPage = lazy(() => import('@/pages/master-data/DocumentManagementPage'));
const WorkshopManagementPage = lazy(() => import('@/pages/master-data/WorkshopManagementPage'));
const EquipmentPage = lazy(() => import('@/pages/master-data/EquipmentPage'));

const OrganizationPage = lazy(() => import('@/pages/system/OrganizationPage'));
const UserPage = lazy(() => import('@/pages/system/UserPage'));
const RolePage = lazy(() => import('@/pages/system/RolePage'));
const MenuManagementPage = lazy(() => import('@/pages/system/MenuManagementPage'));
const BusinessDictionaryPage = lazy(() => import('@/pages/system/BusinessDictionaryPage'));
const IconManagementPage = lazy(() => import('@/pages/system/IconManagementPage'));
const SystemSettingsPage = lazy(() => import('@/pages/system/SystemSettingsPage'));
const AuditLogPage = lazy(() => import('@/pages/system/AuditLogPage'));
const LoginLogPage = lazy(() => import('@/pages/system/LoginLogPage'));

const Loading = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', py: 8 }}>
    <CircularProgress />
  </Box>
);

/** Protected route wrapper. In Phase 0, checks localStorage token. */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

const AppRouter = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route
          index
          element={
            <Suspense fallback={<Loading />}>
              <DashboardPage />
            </Suspense>
          }
        />
        <Route path="account">
          <Route path="settings" element={<Suspense fallback={<Loading />}><PersonalSettingsPage /></Suspense>} />
        </Route>
        <Route path="pack">
          <Route path="manufacturing" element={<Suspense fallback={<Loading />}><PackManufacturingPage /></Suspense>} />
          <Route path="orders" element={<Suspense fallback={<Loading />}><PackWorkOrderPage /></Suspense>} />
          <Route path="objects" element={<Suspense fallback={<Loading />}><PackObjectPage /></Suspense>} />
          <Route path="execution" element={<Suspense fallback={<Loading />}><PackExecutionPage /></Suspense>} />
          <Route path="quality" element={<Suspense fallback={<Loading />}><PackQualityPage /></Suspense>} />
          <Route path="trace" element={<Suspense fallback={<Loading />}><PackTracePage /></Suspense>} />
          <Route path="integration" element={<Suspense fallback={<Loading />}><PackIntegrationPage /></Suspense>} />
        </Route>
        <Route path="production/execution" element={<Navigate to="/pack/execution" replace />} />
        <Route path="production/work-orders" element={<Navigate to="/pack/orders" replace />} />
        <Route path="production/batches" element={<Navigate to="/pack/objects" replace />} />
        <Route path="master-data">
          <Route path="sites" element={<Suspense fallback={<Loading />}><ProductionResourcePage kind="factories" /></Suspense>} />
          <Route path="production-lines" element={<Suspense fallback={<Loading />}><ProductionResourcePage kind="lines" /></Suspense>} />
          <Route path="workstations" element={<Suspense fallback={<Loading />}><ProductionResourcePage kind="stations" /></Suspense>} />
          <Route path="materials" element={<Suspense fallback={<Loading />}><ProcessModelingPage pageKey="materials" /></Suspense>} />
          <Route path="operations" element={<Suspense fallback={<Loading />}><ProcessModelingPage pageKey="operations" /></Suspense>} />
          <Route path="routes" element={<Suspense fallback={<Loading />}><ProcessModelingPage pageKey="routes" /></Suspense>} />
          <Route path="products" element={<Suspense fallback={<Loading />}><ProductModelingPage /></Suspense>} />
          <Route path="products/:productVersionId/modeling" element={<Suspense fallback={<Loading />}><ProductModelingWorkspacePage /></Suspense>} />
          <Route path="product-families" element={<Suspense fallback={<Loading />}><ProductFamilyModelingPage /></Suspense>} />
          <Route path="documents" element={<Suspense fallback={<Loading />}><DocumentManagementPage /></Suspense>} />
          <Route path="workshops" element={<Suspense fallback={<Loading />}><WorkshopManagementPage /></Suspense>} />
          <Route path="equipment-types" element={<Suspense fallback={<Loading />}><EquipmentPage key="types" pageKey="types" /></Suspense>} />
          <Route path="equipment" element={<Suspense fallback={<Loading />}><EquipmentPage key="equipment" pageKey="equipment" /></Suspense>} />
        </Route>
        <Route path="system">
          <Route path="organization" element={<Suspense fallback={<Loading />}><OrganizationPage /></Suspense>} />
          <Route path="users" element={<Suspense fallback={<Loading />}><UserPage /></Suspense>} />
          <Route path="roles" element={<Suspense fallback={<Loading />}><RolePage /></Suspense>} />
          <Route path="menu-management" element={<Suspense fallback={<Loading />}><MenuManagementPage /></Suspense>} />
          <Route path="dictionaries" element={<Suspense fallback={<Loading />}><BusinessDictionaryPage /></Suspense>} />
          <Route path="icons" element={<Suspense fallback={<Loading />}><IconManagementPage /></Suspense>} />
          <Route path="settings" element={<Suspense fallback={<Loading />}><SystemSettingsPage /></Suspense>} />
          <Route path="login-logs" element={<Suspense fallback={<Loading />}><LoginLogPage /></Suspense>} />
          <Route path="audit-logs" element={<Suspense fallback={<Loading />}><AuditLogPage /></Suspense>} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
};

export default AppRouter;
