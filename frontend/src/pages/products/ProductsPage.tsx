import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  CardMedia,
  Chip,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ViewListIcon from '@mui/icons-material/ViewList';
import GridViewIcon from '@mui/icons-material/GridView';
import TableRowsIcon from '@mui/icons-material/TableRows';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { SearchBar } from '@/components/common/SearchBar';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { ProductMetaChips } from '@/components/products/ProductMetaChips';
import { DROPDOWN_PAGE_SIZE, GRID_PAGE_SIZE, PRODUCT_CATEGORIES, PRODUCT_STATUS_OPTIONS } from '@/constants';
import { useProducts, useInfiniteProducts } from '@/hooks/useProducts';
import { useDiscountRules } from '@/hooks/useDiscounts';
import { useSuppliers } from '@/hooks/useSuppliers';
import { PriceWithUom } from '@/components/products/PriceWithUom';
import { isAdminOrManager, canManagePurchaseOrders, productStatusColor, productStatusLabel, productStatusOf } from '@/utils';
import { buildProductDiscountMap } from '@/utils/discountDisplay';
import { useCategoryNames } from '@/hooks/useCategories';
import { useAuthStore } from '@/store';
import type { Product, ProductStatus } from '@/types';
import { ProductSheetView } from '@/pages/products/components/ProductSheetView';
import { filterByStock, type StockFilter } from '@/pages/products/productStockFilter';

const LIST_PAGE_SIZE = 10;
const SHEET_PAGE_SIZE = 25;

type ViewMode = 'grid' | 'list' | 'sheet';
type ProductSortField = '' | 'name' | 'sku' | 'sellingPrice';

// ── Grid card ──────────────────────────────────────────────────────────────────
interface ProductGridCardProps {
  product: Product;
  discountLabel?: string | null;
  onClick: () => void;
}

const ProductGridCard = memo(function ProductGridCard({ product, discountLabel, onClick }: ProductGridCardProps) {
  const stockColor =
    product.stock === 0 ? 'error' : product.stock <= product.lowStockThreshold ? 'warning' : 'success';
  const stockLabel =
    product.stock === 0
      ? 'Out'
      : product.stock <= product.lowStockThreshold
        ? `Low: ${product.stock}`
        : String(product.stock);

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardActionArea onClick={onClick} sx={{ flexGrow: 1 }}>
        {product.images[0] ? (
          <CardMedia
            component="img"
            image={product.images[0]}
            alt={product.name}
            sx={{ height: 160, objectFit: 'cover' }}
          />
        ) : (
          <Box
            sx={{
              height: 160,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'action.hover',
              fontSize: '2.5rem',
              fontWeight: 700,
              color: 'text.disabled',
            }}
          >
            {(product.name[0] ?? '?').toUpperCase()}
          </Box>
        )}
        <CardContent sx={{ pb: 1 }}>
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 700,
              lineHeight: 1.35,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 2,
              mb: 0.75,
            }}
            title={product.name}
          >
            {product.name}
          </Typography>
          <Box sx={{ mb: 0.75 }}>
            <ProductMetaChips
              category={product.category}
              tags={product.tags}
              discountLabel={discountLabel}
            />
          </Box>
          {productStatusOf(product.status) !== 'active' && (
            <Chip
              label={productStatusLabel(product.status)}
              size="small"
              color={productStatusColor(product.status)}
              sx={{ mb: 0.75, ml: product.category ? 0.5 : 0, height: 20, fontSize: '0.65rem' }}
            />
          )}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 0.5, mt: 0.5, minWidth: 0 }}>
            <Box sx={{ minWidth: 0, overflow: 'hidden', flex: '1 1 auto' }}>
              <PriceWithUom
                price={product.sellingPrice}
                uom={product.uom ?? 'pcs'}
                priceSx={{ fontSize: '0.8125rem' }}
              />
            </Box>
            <Chip
              label={stockLabel}
              color={stockColor}
              size="small"
              sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }}
            />
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
});

// ── Page ───────────────────────────────────────────────────────────────────────
export function ProductsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const canManage = isAdminOrManager(user?.role);
  const canCreatePo = canManagePurchaseOrders(user?.role);
  const dbCategories = useCategoryNames();
  const categoryOptions = dbCategories.length > 0 ? dbCategories : [...PRODUCT_CATEGORIES];
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('');
  const [statusFilter, setStatusFilter] = useState<'' | ProductStatus>('');
  const [sortBy, setSortBy] = useState<ProductSortField>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(GRID_PAGE_SIZE);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // sentinel ref for infinite scroll
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const { data: suppliersData } = useSuppliers({ pageSize: DROPDOWN_PAGE_SIZE });
  const { data: discountRules = [] } = useDiscountRules(true);
  const suppliers = suppliersData?.data ?? [];

  // Shared query params (no page — used for infinite + list)
  const sharedParams = {
    search: search || undefined,
    category: category || undefined,
    supplierId: supplierId || undefined,
    status: statusFilter || undefined,
    sortBy: sortBy || undefined,
    sortOrder: sortBy ? sortOrder : undefined,
  };

  const handleSort = (field: ProductSortField) => {
    if (!field) return;
    if (sortBy === field) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setPage(0);
  };

  const handlePriceSort = (order: 'asc' | 'desc') => {
    setSortBy('sellingPrice');
    setSortOrder(order);
    setPage(0);
  };

  // ── Infinite query (grid) ────────────────────────────────────────────────────
  const {
    data: infiniteData,
    isLoading: infiniteLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteProducts(sharedParams);

  // ── Paged query (list) ──────────────────────────────────────────────────────
  const { data: pagedData, isLoading: pagedLoading } = useProducts(
    { ...sharedParams, page: page + 1, pageSize },
    { enabled: viewMode === 'list' || viewMode === 'sheet' },
  );

  // ── Flatten infinite pages for grid ─────────────────────────────────────────
  const allGridProducts = infiniteData?.pages.flatMap((p) => p.data) ?? [];

  const filteredGridProducts = filterByStock(allGridProducts, stockFilter);

  // ── List / sheet products (paged) ───────────────────────────────────────────
  const listProducts = pagedData?.data ?? [];

  const discountMap = useMemo(
    () => buildProductDiscountMap(
      viewMode === 'grid' ? filteredGridProducts : listProducts,
      discountRules,
    ),
    [viewMode, filteredGridProducts, listProducts, discountRules],
  );

  // ── IntersectionObserver sentinel ───────────────────────────────────────────
  useEffect(() => {
    if (viewMode !== 'grid') return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [viewMode, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ── List columns (no actions) ────────────────────────────────────────────────
  const columns: Column<Product>[] = [
    {
      id: 'image',
      label: '',
      minWidth: 56,
      render: (row) => (
        <Box
          component="img"
          src={row.images[0]}
          alt={row.name}
          sx={{ width: 40, height: 40, borderRadius: 1, objectFit: 'cover', display: 'block', bgcolor: 'action.hover' }}
          onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      ),
    },
    { id: 'name', label: 'Product Name', minWidth: 180, accessor: 'name', sortable: true, sortKey: 'name' },
    { id: 'sku', label: 'SKU', minWidth: 130, accessor: 'sku', sortable: true, sortKey: 'sku' },
    { id: 'category', label: 'Category', accessor: 'category' },
    {
      id: 'tags',
      label: 'Tags',
      minWidth: 140,
      render: (row) => (
        row.tags && row.tags.length > 0 ? (
          <ProductMetaChips tags={row.tags} showCategory={false} maxTags={2} />
        ) : (
          '—'
        )
      ),
    },
    {
      id: 'discount',
      label: 'Discount',
      minWidth: 120,
      render: (row) => {
        const label = discountMap.get(row.id);
        return label ? (
          <Chip label={label} size="small" color="success" sx={{ height: 22, fontSize: '0.7rem' }} />
        ) : (
          '—'
        );
      },
    },
    {
      id: 'status',
      label: 'Status',
      render: (row) => (
        <Chip
          label={productStatusLabel(row.status)}
          size="small"
          color={productStatusColor(row.status)}
          variant={productStatusOf(row.status) === 'active' ? 'outlined' : 'filled'}
        />
      ),
    },
    { id: 'brand', label: 'Brand', accessor: 'brand' },
    {
      id: 'supplier',
      label: 'Supplier',
      minWidth: 140,
      render: (row) => row.supplierName ?? '—',
    },
    {
      id: 'sellingPrice',
      label: 'Price',
      align: 'right',
      render: (row) => (
        <PriceWithUom price={row.sellingPrice} uom={row.uom ?? 'pcs'} priceSx={{ fontSize: '0.8125rem' }} />
      ),
    },
    {
      id: 'stock',
      label: 'Stock',
      align: 'right',
      render: (row) => (
        <Chip
          label={
            row.stock === 0
              ? 'Out of Stock'
              : row.stock <= row.lowStockThreshold
                ? `Low: ${row.stock}`
                : row.stock
          }
          color={row.stock === 0 ? 'error' : row.stock <= row.lowStockThreshold ? 'warning' : 'success'}
          size="small"
        />
      ),
    },
  ];

  const resetFilters = (newViewMode?: ViewMode) => {
    setPage(0);
    if (newViewMode) {
      setViewMode(newViewMode);
      setPageSize(
        newViewMode === 'grid' ? GRID_PAGE_SIZE
        : newViewMode === 'sheet' ? SHEET_PAGE_SIZE
        : LIST_PAGE_SIZE,
      );
    }
  };

  return (
    <Box>
      <PageHeader
        title="Products"
        subtitle={`${pagedData?.total ?? (infiniteData?.pages[0]?.total ?? 0)} products in catalog`}
        action={
          canManage ? (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/products/new')}>
              Add Product
            </Button>
          ) : undefined
        }
      />

      {/* ── Toolbar ── */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <SearchBar
            value={search}
            onChange={(v) => { setSearch(v); resetFilters(); }}
            placeholder="Search by name, SKU, barcode..."
          />
        </Box>

        {/* Category */}
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Category</InputLabel>
          <Select
            label="Category"
            value={category}
            onChange={(e) => { setCategory(e.target.value); resetFilters(); }}
          >
            <MenuItem value="">All Categories</MenuItem>
            {categoryOptions.map((c) => (
              <MenuItem key={c} value={c}>{c}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Supplier */}
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Supplier</InputLabel>
          <Select
            label="Supplier"
            value={supplierId}
            onChange={(e) => { setSupplierId(e.target.value); resetFilters(); }}
          >
            <MenuItem value="">All Suppliers</MenuItem>
            {suppliers.map((s) => (
              <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Product status */}
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Status</InputLabel>
          <Select
            label="Status"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as '' | ProductStatus); resetFilters(); }}
          >
            <MenuItem value="">All Statuses</MenuItem>
            {PRODUCT_STATUS_OPTIONS.map((s) => (
              <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Stock status quick filter */}
        <ToggleButtonGroup
          value={stockFilter}
          exclusive
          size="small"
          onChange={(_, v: StockFilter) => setStockFilter(v ?? '')}
        >
          <ToggleButton value="">All</ToggleButton>
          <ToggleButton value="in">In Stock</ToggleButton>
          <ToggleButton value="low">Low</ToggleButton>
          <ToggleButton value="out">Out</ToggleButton>
        </ToggleButtonGroup>

        {/* Price sort */}
        <ToggleButtonGroup
          value={sortBy === 'sellingPrice' ? sortOrder : ''}
          exclusive
          size="small"
          onChange={(_, v: 'asc' | 'desc' | '') => {
            if (v) handlePriceSort(v);
          }}
        >
          <Tooltip title="Price: Low to High">
            <ToggleButton value="asc" aria-label="Price ascending">
              <ArrowUpwardIcon fontSize="small" sx={{ mr: 0.5 }} />
              <Typography variant="caption" sx={{ fontWeight: 600 }}>Price</Typography>
            </ToggleButton>
          </Tooltip>
          <Tooltip title="Price: High to Low">
            <ToggleButton value="desc" aria-label="Price descending">
              <Typography variant="caption" sx={{ fontWeight: 600 }}>Price</Typography>
              <ArrowDownwardIcon fontSize="small" sx={{ ml: 0.5 }} />
            </ToggleButton>
          </Tooltip>
        </ToggleButtonGroup>

        {/* View toggle */}
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          size="small"
          onChange={(_, v: ViewMode) => { if (v) resetFilters(v); }}
        >
          <ToggleButton value="grid" aria-label="Grid view">
            <Tooltip title="Grid view">
              <GridViewIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="list" aria-label="List view">
            <Tooltip title="List view">
              <ViewListIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="sheet" aria-label="Sheet view">
            <Tooltip title="Sheet view (copy for PO)">
              <TableRowsIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* ── Grid view (infinite scroll) ── */}
      {viewMode === 'grid' && (
        <Box>
          {infiniteLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress />
            </Box>
          ) : filteredGridProducts.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
              No products found
            </Typography>
          ) : (
            <Grid container spacing={2}>
              {filteredGridProducts.map((product) => (
                <Grid key={product.id} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
                  <ProductGridCard
                    product={product}
                    discountLabel={discountMap.get(product.id)}
                    onClick={() => navigate(`/products/${product.id}`)}
                  />
                </Grid>
              ))}
            </Grid>
          )}

          {/* Sentinel + load-more indicator (only after first page renders) */}
          {!infiniteLoading && filteredGridProducts.length > 0 && (
            <Box ref={sentinelRef} sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              {isFetchingNextPage && <CircularProgress size={24} />}
              {!isFetchingNextPage && !hasNextPage && (
                <Typography variant="caption" color="text.disabled">
                  All products loaded
                </Typography>
              )}
            </Box>
          )}
        </Box>
      )}

      {/* ── List view (paged) ── */}
      {viewMode === 'list' && (
        <DataTable
          columns={columns}
          rows={listProducts}
          loading={pagedLoading}
          page={page}
          pageSize={pageSize}
          total={pagedData?.total}
          onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s); setPage(0); }}
          getRowId={(r) => r.id}
          onRowClick={(r) => navigate(`/products/${r.id}`)}
          sortBy={sortBy || undefined}
          sortOrder={sortOrder}
          onSort={(key) => handleSort(key as ProductSortField)}
        />
      )}

      {viewMode === 'sheet' && (
        <ProductSheetView
          products={listProducts}
          loading={pagedLoading}
          page={page}
          pageSize={pageSize}
          total={pagedData?.total}
          onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s); setPage(0); }}
          filters={sharedParams}
          stockFilter={stockFilter}
          canCreatePo={canCreatePo}
          canBulkEdit={canManage}
          sortBy={sortBy || undefined}
          sortOrder={sortOrder}
          onSort={(field) => handleSort(field)}
        />
      )}
    </Box>
  );
}
