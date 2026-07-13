import { useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  IconButton,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { useBulkCreateProducts } from '@/hooks/useProducts';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useUomOptions } from '@/hooks/useUoms';
import { useCategoryNames } from '@/hooks/useCategories';
import { DROPDOWN_PAGE_SIZE, PRODUCT_CATEGORIES } from '@/constants';
import { getErrorMessage } from '@/services/apiClient';
import { showSuccess } from '@/utils/toast';
import type { ProductBulkCreateItem } from '@/types';
import { noNumberSpinnerSx } from '@/pages/purchase-orders/inputStyles';

type ProductRow = {
  id: number;
  sku: string;
  name: string;
  brand: string;
  category: string;
  buyUom: string;
  uom: string;
  unitsPerBuyUom: string;
  costPrice: string;
  sellingPrice: string;
};

const emptyRow = (id: number): ProductRow => ({
  id, sku: '', name: '', brand: '', category: '', buyUom: 'pcs', uom: 'pcs',
  unitsPerBuyUom: '1', costPrice: '0', sellingPrice: '0',
});

const HEADER_ALIASES: Record<string, keyof Omit<ProductRow, 'id'>> = {
  sku: 'sku', code: 'sku', name: 'name', 'product name': 'name', product: 'name',
  brand: 'brand', category: 'category', 'buy uom': 'buyUom',
  'base uom': 'uom', uom: 'uom', 'units/pack': 'unitsPerBuyUom', 'units per pack': 'unitsPerBuyUom',
  'units per buy': 'unitsPerBuyUom', cost: 'costPrice', 'cost price': 'costPrice',
  'unit cost': 'costPrice', price: 'sellingPrice', 'selling price': 'sellingPrice', 'unit price': 'sellingPrice',
};

function parsePaste(text: string, firstId: number): ProductRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const cells = lines.map((line) => line.split('\t').map((cell) => cell.trim()));
  const headers = cells[0].map((header) => HEADER_ALIASES[header.toLowerCase()]);
  const hasHeaders = headers.some(Boolean);
  const rows = hasHeaders ? cells.slice(1) : cells;
  const defaultColumns: Array<keyof Omit<ProductRow, 'id'>> = [
    'sku', 'name', 'brand', 'category', 'buyUom', 'uom', 'unitsPerBuyUom', 'costPrice', 'sellingPrice',
  ];
  return rows.filter((row) => row.some(Boolean)).map((cellsForRow, index) => {
    const row = emptyRow(firstId + index);
    cellsForRow.forEach((value, column) => {
      const key = hasHeaders ? headers[column] : defaultColumns[column];
      if (key) row[key] = value;
    });
    return row;
  });
}

function generateSku(brand: string, category: string): string {
  const b = (brand || 'PRD').replace(/\s+/g, '').slice(0, 3).toUpperCase();
  const c = (category || 'GEN')
    .split(/[\s&]+/)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 3);
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return `${b}-${c}-${rand}`;
}

export function BulkProductFormPage() {
  const navigate = useNavigate();
  const nextId = useRef(6);
  const [rows, setRows] = useState<ProductRow[]>(() => Array.from({ length: 5 }, (_, id) => emptyRow(id + 1)));
  const [supplierId, setSupplierId] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState('10');
  const [error, setError] = useState('');
  const [pasteNotice, setPasteNotice] = useState('');
  const createMutation = useBulkCreateProducts();
  const { data: suppliersData } = useSuppliers({ pageSize: DROPDOWN_PAGE_SIZE });
  const uomOptions = useUomOptions();
  const dbCategories = useCategoryNames();
  const categories = dbCategories.length ? dbCategories : PRODUCT_CATEGORIES;

  const change = (id: number, field: keyof Omit<ProductRow, 'id'>, value: string) => {
    setRows((current) => current.map((row) => row.id === id ? { ...row, [field]: value } : row));
  };
  const addRow = () => setRows((current) => [...current, emptyRow(nextId.current++)]);
  const removeRow = (id: number) => setRows((current) => current.length > 1 ? current.filter((row) => row.id !== id) : current);
  const normalizeUom = (value: string) => {
    const normalized = value.trim().toLowerCase();
    return uomOptions.find((option) =>
      option.value.toLowerCase() === normalized || option.label.toLowerCase() === normalized,
    )?.value ?? value;
  };
  const generateSkus = () => {
    setRows((current) => {
      const used = new Set(current.map((row) => row.sku.trim().toLowerCase()).filter(Boolean));
      return current.map((row) => {
        if (row.sku.trim() || !row.name.trim()) return row;
        let sku = generateSku(row.brand, row.category);
        while (used.has(sku.toLowerCase())) sku = generateSku(row.brand, row.category);
        used.add(sku.toLowerCase());
        return { ...row, sku };
      });
    });
  };
  const paste = (text: string) => {
    const imported = parsePaste(text, nextId.current);
    if (!imported.length) return;
    nextId.current += imported.length;
    setRows(imported.map((row) => ({
      ...row,
      buyUom: normalizeUom(row.buyUom),
      uom: normalizeUom(row.uom),
    })));
    setPasteNotice(`${imported.length} row${imported.length === 1 ? '' : 's'} added from Excel. Review, then save.`);
    setError('');
  };

  const save = async () => {
    setError('');
    const populated = rows.filter((row) => Object.values(row).some((value) => String(value).trim()) && (row.sku.trim() || row.name.trim()));
    if (!populated.length) { setError('Add at least one product row.'); return; }
    const invalid = populated.find((row) => !row.sku.trim() || !row.name.trim() || Number(row.costPrice) < 0 || Number(row.sellingPrice) < 0 || !Number.isFinite(Number(row.unitsPerBuyUom)) || Number(row.unitsPerBuyUom) < 1);
    if (invalid) { setError(`Complete SKU, name, prices, and units/pack on row ${rows.indexOf(invalid) + 1}.`); return; }
    const duplicate = populated.find((row, index) => populated.findIndex((other) => other.sku.trim().toLowerCase() === row.sku.trim().toLowerCase()) !== index);
    if (duplicate) { setError(`SKU ${duplicate.sku} is repeated in the grid.`); return; }
    const products: ProductBulkCreateItem[] = populated.map((row) => ({
      row: rows.indexOf(row) + 1,
      sku: row.sku.trim(), name: row.name.trim(), barcode: '', brand: row.brand,
      countryOfOrigin: '', category: row.category, supplierId, description: '', buyUom: row.buyUom || 'pcs', uom: row.uom || 'pcs',
      unitsPerBuyUom: Number(row.unitsPerBuyUom), sellMode: 'piece', costPrice: Number(row.costPrice), sellingPrice: Number(row.sellingPrice),
      packSellingPrice: 0, discountPercent: 0, offeredPrice: 0, packDiscountPercent: 0, packOfferedPrice: 0,
      images: [], stock: 0, lowStockThreshold: Number(lowStockThreshold) || 0, status: 'active', tags: [],
    }));
    try {
      const result = await createMutation.mutateAsync(products);
      if (result.created) showSuccess(`${result.created} product${result.created === 1 ? '' : 's'} added.`);
      if (result.errors.length) {
        setError(result.errors.map((item) => `Row ${item.row} (${item.sku}): ${item.detail}`).join(' · '));
        return;
      }
      navigate('/products');
    } catch (err) { setError(getErrorMessage(err)); }
  };

  return (
    <Box>
      <PageHeader
        title="Bulk Add Products"
        breadcrumbs={[{ label: 'Products', path: '/products' }, { label: 'Bulk add' }]}
        action={<Box sx={{ display: 'flex', gap: 1 }}><Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/products')}>Cancel</Button><Button variant="contained" startIcon={<SaveIcon />} onClick={() => void save()} loading={createMutation.isPending}>Add products</Button></Box>}
      />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {pasteNotice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setPasteNotice('')}>{pasteNotice}</Alert>}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="body2" sx={{ mb: 1 }}>Paste rows copied from Excel directly into the grid. Headers are optional; supported columns are SKU, Product Name, Brand, Category, Buy UOM, Base UOM, Units/pack, Unit Cost, and Selling Price.</Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField select label="Primary supplier (optional)" size="small" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} sx={{ minWidth: 220 }}><MenuItem value="">None</MenuItem>{(suppliersData?.data ?? []).map((supplier) => <MenuItem key={supplier.id} value={supplier.id}>{supplier.name}</MenuItem>)}</TextField>
          <TextField label="Low-stock threshold" size="small" type="number" value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} slotProps={{ htmlInput: { min: 0 } }} />
          <Button startIcon={<ContentPasteIcon />} onClick={() => navigator.clipboard.readText().then(paste).catch(() => setError('Use Ctrl+V in any grid cell to paste from Excel.'))}>Paste from clipboard</Button>
          <Button startIcon={<AutorenewIcon />} onClick={generateSkus}>Generate SKUs</Button>
        </Box>
      </Paper>
      <TableContainer component={Paper} onPaste={(event) => { const text = event.clipboardData.getData('text'); if (text.includes('\t') || text.includes('\n')) { event.preventDefault(); paste(text); } }}>
        <Table size="small" sx={{ minWidth: 1280, '& .MuiTableCell-root': { px: 0.5, py: 0.5 } }}><TableHead><TableRow>{['SN', 'SKU *', 'Product name *', 'Brand', 'Category', 'Buy UOM', 'Base UOM', 'Units/pack', 'Unit cost', 'Selling price', ''].map((label) => <TableCell key={label} sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</TableCell>)}</TableRow></TableHead>
          <TableBody>{rows.map((row, index) => <TableRow key={row.id}><TableCell sx={{ color: 'text.secondary', width: 38 }}>{index + 1}</TableCell>{(['sku', 'name', 'brand'] as const).map((field) => <TableCell key={field}><TextField value={row[field]} onChange={(e) => change(row.id, field, e.target.value)} size="small" required={field === 'sku' || field === 'name'} sx={field === 'name' ? { width: 260 } : field === 'sku' || field === 'brand' ? { width: 180 } : undefined} /></TableCell>)}
            <TableCell><TextField select value={row.category} onChange={(e) => change(row.id, 'category', e.target.value)} size="small" sx={{ minWidth: 130 }}><MenuItem value="">None</MenuItem>{categories.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}</TextField></TableCell>
            {(['buyUom', 'uom'] as const).map((field) => <TableCell key={field}><TextField select value={row[field]} onChange={(e) => change(row.id, field, e.target.value)} size="small" sx={{ minWidth: 100 }}>{uomOptions.map((uom) => <MenuItem key={uom.value} value={uom.value}>{uom.label}</MenuItem>)}</TextField></TableCell>)}
            {(['unitsPerBuyUom', 'costPrice', 'sellingPrice'] as const).map((field) => <TableCell key={field}><TextField value={row[field]} onChange={(e) => change(row.id, field, e.target.value)} type="number" size="small" slotProps={{ htmlInput: { min: field === 'unitsPerBuyUom' ? 1 : 0, step: field === 'unitsPerBuyUom' ? 1 : 0.01 } }} sx={{ width: field === 'unitsPerBuyUom' ? 82 : 90, ...(field === 'costPrice' || field === 'sellingPrice' ? noNumberSpinnerSx : {}) }} /></TableCell>)}
            <TableCell><IconButton aria-label="Remove row" onClick={() => removeRow(row.id)}><DeleteIcon /></IconButton></TableCell></TableRow>)}</TableBody>
        </Table>
      </TableContainer>
      <Button sx={{ mt: 1.5 }} startIcon={<AddIcon />} onClick={addRow}>Add row</Button>
    </Box>
  );
}
