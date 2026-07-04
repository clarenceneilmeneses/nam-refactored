import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/hooks/useAuth'
import { AppShell } from '@/components/layout/AppShell'
import { RequirePermission, RequireSuperAdmin } from '@/components/layout/PermissionGate'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { SalesEntryPage } from '@/features/sales/SalesEntryPage'
import { RecordsPage } from '@/features/sales/RecordsPage'
import { QuotationsPage } from '@/features/quotations/QuotationsPage'
import { ProductsPage } from '@/features/products/ProductsPage'
import { FinancePage } from '@/features/finance/FinancePage'
import { LogisticsPage } from '@/features/logistics/LogisticsPage'
import { ImportPage } from '@/features/imports/ImportPage'
import { UsersPage } from '@/features/admin/UsersPage'
import { RolesPage } from '@/features/admin/RolesPage'
import { LogsPage } from '@/features/admin/LogsPage'
import { AssignmentsPage } from '@/features/admin/AssignmentsPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppShell />}>
            <Route
              index
              element={
                <RequirePermission perm="view_dashboard">
                  <DashboardPage />
                </RequirePermission>
              }
            />
            <Route
              path="/sales/new"
              element={
                <RequirePermission perm="manage_sales">
                  <SalesEntryPage />
                </RequirePermission>
              }
            />
            <Route
              path="/records"
              element={
                <RequirePermission perm={['manage_sales', 'view_dashboard']}>
                  <RecordsPage />
                </RequirePermission>
              }
            />
            <Route
              path="/quotations"
              element={
                <RequirePermission perm="manage_sales">
                  <QuotationsPage />
                </RequirePermission>
              }
            />
            <Route
              path="/products"
              element={
                <RequirePermission perm="manage_products">
                  <ProductsPage />
                </RequirePermission>
              }
            />
            <Route
              path="/finance"
              element={
                <RequirePermission perm={['manage_finance', 'view_dashboard']}>
                  <FinancePage />
                </RequirePermission>
              }
            />
            <Route
              path="/logistics"
              element={
                <RequirePermission perm="view_logistics">
                  <LogisticsPage />
                </RequirePermission>
              }
            />
            <Route
              path="/import"
              element={
                <RequireSuperAdmin>
                  <ImportPage />
                </RequireSuperAdmin>
              }
            />
            {/* Legacy parity: the whole admin area is Super Admin (role id 1) only. */}
            <Route
              path="/admin/users"
              element={
                <RequireSuperAdmin>
                  <UsersPage />
                </RequireSuperAdmin>
              }
            />
            <Route
              path="/admin/roles"
              element={
                <RequireSuperAdmin>
                  <RolesPage />
                </RequireSuperAdmin>
              }
            />
            <Route
              path="/admin/logs"
              element={
                <RequireSuperAdmin>
                  <LogsPage />
                </RequireSuperAdmin>
              }
            />
            <Route
              path="/admin/assignments"
              element={
                <RequireSuperAdmin>
                  <AssignmentsPage />
                </RequireSuperAdmin>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </AuthProvider>
  )
}
