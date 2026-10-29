import { useState } from "react";

import {
  Box,
  Button,
  Chip,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";

import AddIcon from "@mui/icons-material/Add";

import RestartAltIcon from "@mui/icons-material/RestartAlt";

import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";

import PaymentsIcon from "@mui/icons-material/Payments";

import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";

import LocalShippingIcon from "@mui/icons-material/LocalShipping";

import BlockIcon from "@mui/icons-material/Block";

import { StatCard } from "@/components/common/StatCard";

import { useNavigate } from "react-router-dom";

import { SearchBar } from "@/components/common/SearchBar";

import { DataTable, type Column } from "@/components/tables/DataTable";

import { usePurchaseOrders } from "@/hooks/usePurchaseOrders";

import { formatCurrency, canManagePurchaseOrders } from "@/utils";

import { useFormatDate } from "@/hooks/useFormatDate";

import { PO_PAYMENT_STATUS_LABELS, PO_STATUS_LABELS } from "@/constants";

import type {
  PurchaseOrder,
  PurchaseOrderPaymentStatus,
  PurchaseOrderStatus,
} from "@/types";

import { useAuthStore } from "@/store";

const STATUS_COLORS: Record<
  PurchaseOrderStatus,
  "default" | "warning" | "info" | "success" | "error"
> = {
  draft: "default",

  ordered: "warning",

  partial: "info",

  received: "success",

  cancelled: "error",
};

const PAYMENT_COLORS: Record<
  PurchaseOrderPaymentStatus,
  "default" | "warning" | "success"
> = {
  unpaid: "default",

  partial: "warning",

  paid: "success",
};

const PO_STATUS_OPTIONS: PurchaseOrderStatus[] = [
  "draft",

  "ordered",

  "partial",

  "received",

  "cancelled",
];

const PO_PAYMENT_OPTIONS: PurchaseOrderPaymentStatus[] = [
  "unpaid",

  "partial",

  "paid",
];

const SORT_KEY_MAP: Record<string, string> = {
  orderNumber: "order_number",

  supplierName: "supplier_name",

  billNumber: "bill_number",

  status: "status",

  paymentStatus: "payment_status",

  items: "items_count",

  totalAmount: "total_amount",

  amountPaid: "amount_paid",

  orderedBy: "ordered_by",

  createdAt: "created_at",

  receivedDate: "received_date",

  expectedDelivery: "expected_delivery",
};

export function PurchaseOrdersPage() {
  const navigate = useNavigate();

  const formatDate = useFormatDate();

  const user = useAuthStore((s) => s.user);

  const canManage = canManagePurchaseOrders(user?.role);

  const [search, setSearch] = useState("");

  const [page, setPage] = useState(0);

  const [status, setStatus] = useState<PurchaseOrderStatus | "">("");

  const [paymentStatus, setPaymentStatus] = useState<
    PurchaseOrderPaymentStatus | ""
  >("");

  const [sortBy, setSortBy] = useState("createdAt");

  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const resetFilters = () => {
    setSearch("");

    setStatus("");

    setPaymentStatus("");

    setSortBy("createdAt");

    setSortOrder("desc");

    setPage(0);
  };

  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);

      setSortOrder("desc");
    }

    setPage(0);
  };

  const { data, isLoading } = usePurchaseOrders({
    search,

    page: page + 1,

    pageSize: 10,

    status: status || undefined,

    paymentStatus: paymentStatus || undefined,

    sortBy: SORT_KEY_MAP[sortBy] ?? "created_at",

    sortOrder,

    lean: true,

    includeSummary: true,
  });

  const rows = data?.data ?? [];

  const columns: Column<PurchaseOrder>[] = [
    {
      id: "sn",

      label: "SN",

      align: "center",

      minWidth: 48,

      render: (row) => rows.findIndex((r) => r.id === row.id) + 1,
    },

    {
      id: "orderNumber",

      label: "PO Number",

      minWidth: 140,

      accessor: "orderNumber",

      sortable: true,

      sortKey: "orderNumber",
    },

    {
      id: "supplier",

      label: "Supplier",

      accessor: "supplierName",

      sortable: true,

      sortKey: "supplierName",
    },

    {
      id: "billNumber",

      label: "Bill No",

      minWidth: 120,

      sortable: true,

      sortKey: "billNumber",

      render: (row) => (row.billNumber?.trim() ? row.billNumber : "—"),
    },

    {
      id: "status",

      label: "Status",

      sortable: true,

      sortKey: "status",

      render: (row) => (
        <Chip
          label={PO_STATUS_LABELS[row.status] ?? row.status}

          color={STATUS_COLORS[row.status]}

          size="small"
        />
      ),
    },

    {
      id: "payment",

      label: "Payment",

      sortable: true,

      sortKey: "paymentStatus",

      render: (row) => {
        const pay = row.paymentStatus ?? "unpaid";

        return (
          <Chip
            label={PO_PAYMENT_STATUS_LABELS[pay] ?? pay}

            color={PAYMENT_COLORS[pay]}

            size="small"

            variant="outlined"
          />
        );
      },
    },

    {
      id: "items",

      label: "Items",

      align: "right",

      sortable: true,

      sortKey: "items",

      render: (row) => row.itemsCount ?? row.items.length,
    },

    {
      id: "total",

      label: "Total",

      align: "right",

      sortable: true,

      sortKey: "totalAmount",

      render: (row) => formatCurrency(row.totalAmount),
    },

    {
      id: "paid",

      label: "Paid",

      align: "right",

      sortable: true,

      sortKey: "amountPaid",

      render: (row) => formatCurrency(row.amountPaid ?? 0),
    },

    {
      id: "due",

      label: "Due",

      align: "right",

      render: (row) => {
        if (row.status !== "received") {
          return (
            <Typography variant="body2" color="text.secondary">
              —
            </Typography>
          );
        }

        const due = Math.max(
          0,
          Math.round((row.totalAmount - (row.amountPaid ?? 0)) * 100) / 100,
        );

        if (due <= 0) {
          return (
            <Typography
              variant="body2"
              color="success.main"
              sx={{ fontWeight: 600 }}
            >
              Rs. 0.00
            </Typography>
          );
        }

        return (
          <Typography
            variant="body2"
            color="error.main"
            sx={{ fontWeight: 700 }}
          >
            {formatCurrency(due)}
          </Typography>
        );
      },
    },

    {
      id: "orderedBy",

      label: "Ordered By",

      sortable: true,

      sortKey: "orderedBy",

      render: (row) => row.orderedBy ?? "—",
    },

    {
      id: "created",

      label: "Created Date",

      sortable: true,

      sortKey: "createdAt",

      render: (row) => formatDate(row.createdAt),
    },

    {
      id: "receivedDate",

      label: "Received Date",

      sortable: true,

      sortKey: "receivedDate",

      render: (row) => (row.receivedDate ? formatDate(row.receivedDate) : "—"),
    },
  ];

  return (
    <Box>
      <Box
        sx={{
          display: "flex",

          justifyContent: "flex-end",

          alignItems: "center",

          mb: 2,
        }}
      >
        {canManage && (
          <Button
            variant="contained"

            startIcon={<AddIcon />}

            onClick={() => navigate("/purchase-orders/new")}
          >
            Create Order
          </Button>
        )}
      </Box>

      {/* KPI Cards */}

      <Box
        sx={{
          display: "grid",

          gridTemplateColumns: {
            xs: "repeat(2, 1fr)",

            sm: "repeat(3, 1fr)",

            md: "repeat(5, 1fr)",
          },

          gap: 1.5,

          mb: 2.5,
        }}
      >
        <StatCard
          title="Total Purchases"

          value={formatCurrency(
            data?.summary?.totalPurchasesAmount ??
              data?.receivedTotalAmount ??
              0,
          )}

          subtitle={`${data?.summary?.totalPurchasesCount ?? 0} active orders`}

          icon={<ShoppingCartIcon />}

          color="primary.main"

          loading={isLoading}

          onClick={() => {
            setStatus("");

            setPaymentStatus("");

            setPage(0);
          }}

          sx={{
            cursor: "pointer",

            transition: "all 0.15s ease",

            ...(!status &&
              !paymentStatus && {
                outline: "2px solid",

                outlineColor: "primary.main",

                boxShadow: 2,
              }),
          }}
        />

        <StatCard
          title="Total Paid"

          value={formatCurrency(data?.summary?.totalPaidAmount ?? 0)}

          subtitle="Paid to suppliers"

          icon={<PaymentsIcon />}

          color="#1b5e20"

          gradient={["rgba(46, 125, 50, 0.12)", "rgba(46, 125, 50, 0.02)"]}

          loading={isLoading}

          onClick={() => {
            setPaymentStatus((prev) => (prev === "paid" ? "" : "paid"));

            setPage(0);
          }}

          sx={{
            cursor: "pointer",

            transition: "all 0.15s ease",

            ...(paymentStatus === "paid" && {
              outline: "2px solid",

              outlineColor: "#2e7d32",

              boxShadow: 2,
            }),
          }}
        />

        <StatCard
          title="Amount Due"

          value={formatCurrency(
            data?.summary?.amountDue ?? data?.outstandingAmount ?? 0,
          )}

          subtitle={`${data?.summary?.amountDueCount ?? 0} received with balance`}

          icon={<AccountBalanceWalletIcon />}

          color="#b26a00"

          gradient={["rgba(245, 124, 0, 0.14)", "rgba(245, 124, 0, 0.02)"]}

          loading={isLoading}

          onClick={() => {
            if (status === "received" && paymentStatus === "unpaid") {
              setStatus("");

              setPaymentStatus("");
            } else {
              setStatus("received");

              setPaymentStatus("unpaid");
            }

            setPage(0);
          }}

          sx={{
            cursor: "pointer",

            transition: "all 0.15s ease",

            ...(status === "received" &&
              (paymentStatus === "unpaid" || paymentStatus === "partial") && {
                outline: "2px solid",

                outlineColor: "#ed6c02",

                boxShadow: 2,
              }),
          }}
        />

        <StatCard
          title="Pending Delivery"

          value={`${data?.summary?.pendingDeliveryCount ?? 0} orders`}

          subtitle={`${formatCurrency(data?.summary?.pendingDeliveryAmount ?? 0)} in-transit`}

          icon={<LocalShippingIcon />}

          color="#0288d1"

          gradient={["rgba(2, 136, 209, 0.12)", "rgba(2, 136, 209, 0.02)"]}

          loading={isLoading}

          onClick={() => {
            setStatus((prev) => (prev === "ordered" ? "" : "ordered"));

            setPage(0);
          }}

          sx={{
            cursor: "pointer",

            transition: "all 0.15s ease",

            ...(status === "ordered" && {
              outline: "2px solid",

              outlineColor: "#0288d1",

              boxShadow: 2,
            }),
          }}
        />

        <StatCard
          title="Cancelled"

          value={formatCurrency(data?.summary?.cancelledAmount ?? 0)}

          subtitle={`${data?.summary?.cancelledCount ?? 0} aborted`}

          icon={<BlockIcon />}

          color="#c62828"

          gradient={["rgba(211, 47, 47, 0.12)", "rgba(211, 47, 47, 0.02)"]}

          loading={isLoading}

          onClick={() => {
            setStatus((prev) => (prev === "cancelled" ? "" : "cancelled"));

            setPage(0);
          }}

          sx={{
            cursor: "pointer",

            transition: "all 0.15s ease",

            ...(status === "cancelled" && {
              outline: "2px solid",

              outlineColor: "#d32f2f",

              boxShadow: 2,
            }),
          }}
        />
      </Box>

      <Box
        sx={{
          display: "flex",
          gap: 2,
          mb: 2,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <Box sx={{ flex: 1, minWidth: 220 }}>
          <SearchBar
            value={search}

            onChange={(v) => {
              setSearch(v);
              setPage(0);
            }}

            placeholder="Search by PO number or supplier..."
          />
        </Box>

        <TextField
          select

          size="small"

          label="Status"

          value={status}

          onChange={(e) => {
            setStatus(e.target.value as PurchaseOrderStatus | "");

            setPage(0);
          }}

          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">All statuses</MenuItem>

          {PO_STATUS_OPTIONS.map((value) => (
            <MenuItem key={value} value={value}>
              {PO_STATUS_LABELS[value]}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select

          size="small"

          label="Payment"

          value={paymentStatus}

          onChange={(e) => {
            setPaymentStatus(e.target.value as PurchaseOrderPaymentStatus | "");

            setPage(0);
          }}

          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All payments</MenuItem>

          {PO_PAYMENT_OPTIONS.map((value) => (
            <MenuItem key={value} value={value}>
              {PO_PAYMENT_STATUS_LABELS[value]}
            </MenuItem>
          ))}
        </TextField>

        <Button
          size="small"

          variant="outlined"

          startIcon={<RestartAltIcon />}

          onClick={resetFilters}
        >
          Reset filters
        </Button>
      </Box>

      <DataTable
        columns={columns}

        rows={rows}

        loading={isLoading}

        page={page}

        pageSize={10}

        total={data?.total}

        onPageChange={setPage}

        getRowId={(r) => r.id}

        onRowClick={(r) => navigate(`/purchase-orders/${r.id}`)}

        sortBy={sortBy}

        sortOrder={sortOrder}

        onSort={handleSort}
      />
    </Box>
  );
}
