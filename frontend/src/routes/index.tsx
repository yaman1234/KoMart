import { createBrowserRouter, Navigate } from 'react-router-dom';
import { MainLayout } from '@/layouts/MainLayout';
import { AuthLayout } from '@/layouts/AuthLayout';
import { ProtectedRoute, GuestRoute } from '@/routes/guards';
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
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/pos', element: <POSPage /> },
          { path: '/sales', element: <SalesPage /> },
          { path: '/sales/:id', element: <SaleDetailPage /> },
          { path: '/products', element: <ProductsPage /> },
          { path: '/products/new', element: <ProductFormPage /> },
          { path: '/products/:id', element: <ProductDetailPage /> },
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
          { path: '/customers', element: <CustomersPage /> },
          { path: '/customers/:id', element: <CustomerDetailPage /> },
          { path: '/reports', element: <ReportsPage /> },
          { path: '/notifications', element: <PlaceholderPage title="Notifications" subtitle="Alerts and system notifications" /> },
          { path: '/settings', element: <PlaceholderPage title="Settings" subtitle="Store configuration and preferences" /> },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  },
]);
