import { createBrowserRouter, Navigate } from 'react-router-dom';
import { MainLayout } from '@/layouts/MainLayout';
import { AuthLayout } from '@/layouts/AuthLayout';
import { ProtectedRoute, GuestRoute, RoleGuard } from '@/routes/guards';
import { LoginPage } from '@/pages/auth/LoginPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { POSPage } from '@/pages/pos/POSPage';
import { ProductsPage } from '@/pages/products/ProductsPage';
import { ProductFormPage } from '@/pages/products/ProductFormPage';
import { ProductDetailPage } from '@/pages/products/ProductDetailPage';
import { InventoryPage } from '@/pages/inventory/InventoryPage';
import { PurchaseOrdersPage } from '@/pages/purchase-orders/PurchaseOrdersPage';
import { PurchaseOrderFormPage } from '@/pages/purchase-orders/PurchaseOrderFormPage';
import { PurchaseOrderDetailPage } from '@/pages/purchase-orders/PurchaseOrderDetailPage';
import { SalesPage } from '@/pages/sales/SalesPage';
import { SaleDetailPage } from '@/pages/sales/SaleDetailPage';
import { SuppliersPage } from '@/pages/suppliers/SuppliersPage';
import { SupplierFormPage } from '@/pages/suppliers/SupplierFormPage';
import { SupplierDetailPage } from '@/pages/suppliers/SupplierDetailPage';
import { CustomersPage } from '@/pages/customers/CustomersPage';
import { CustomerDetailPage } from '@/pages/customers/CustomerDetailPage';
import { ReportsPage } from '@/pages/reports/ReportsPage';
import { ExpensesPage } from '@/pages/expenses/ExpensesPage';
import { ExpenseFormPage } from '@/pages/expenses/ExpenseFormPage';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/dashboard" replace />,
  },
  {
    element: <GuestRoute />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/forgot-password', element: <ForgotPasswordPage /> },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <MainLayout />,
        children: [
          // Routes accessible by all authenticated users
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/pos', element: <POSPage /> },
          { path: '/sales', element: <SalesPage /> },
          { path: '/sales/:id', element: <SaleDetailPage /> },
          { path: '/products', element: <ProductsPage /> },
          { path: '/products/:id', element: <ProductDetailPage /> },
          { path: '/customers', element: <CustomersPage /> },
          { path: '/customers/:id', element: <CustomerDetailPage /> },
          { path: '/notifications', element: <PlaceholderPage title="Notifications" subtitle="Alerts and system notifications" /> },

          // Manager + Admin only routes
          {
            element: <RoleGuard allow={['admin', 'manager']} />,
            children: [
              { path: '/products/new', element: <ProductFormPage /> },
              { path: '/products/:id/edit', element: <ProductFormPage /> },
              { path: '/inventory', element: <InventoryPage /> },
              { path: '/suppliers', element: <SuppliersPage /> },
              { path: '/suppliers/new', element: <SupplierFormPage /> },
              { path: '/suppliers/:id/edit', element: <SupplierFormPage /> },
              { path: '/suppliers/:id', element: <SupplierDetailPage /> },
              { path: '/purchase-orders', element: <PurchaseOrdersPage /> },
              { path: '/purchase-orders/new', element: <PurchaseOrderFormPage /> },
              { path: '/purchase-orders/:id/edit', element: <PurchaseOrderFormPage /> },
              { path: '/purchase-orders/:id', element: <PurchaseOrderDetailPage /> },
              { path: '/expenses', element: <ExpensesPage /> },
              { path: '/expenses/new', element: <ExpenseFormPage /> },
              { path: '/expenses/:id/edit', element: <ExpenseFormPage /> },
              { path: '/reports', element: <ReportsPage /> },
              { path: '/settings', element: <SettingsPage /> },
              { path: '/settings/:tab', element: <SettingsPage /> },
            ],
          },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  },
]);
