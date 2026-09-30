import { useMemo, useState } from 'react';
import { Autocomplete, MenuItem, TextField } from '@mui/material';
import { FormModal } from '@/components/common/FormModal';
import { DROPDOWN_PAGE_SIZE } from '@/constants';
import { usePurchaseOrders } from '@/hooks/usePurchaseOrders';
import { useSuppliers } from '@/hooks/useSuppliers';
import { PoReturnDialog } from '@/pages/purchase-orders/components/PoReturnDialog';
import { SupplierReturnDialog } from '@/pages/suppliers/components/SupplierReturnDialog';
import type { PurchaseReturnMode } from '@/types';

const RETURNABLE_PO = new Set(['ordered', 'partial', 'received']);

interface CreatePurchaseReturnDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreatePurchaseReturnDialog({ open, onClose }: CreatePurchaseReturnDialogProps) {
  const [mode, setMode] = useState<PurchaseReturnMode>('po_linked');
  const [poId, setPoId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [linesOpen, setLinesOpen] = useState(false);

  const { data: poData, isLoading: poLoading } = usePurchaseOrders(
    { page: 1, pageSize: DROPDOWN_PAGE_SIZE },
    { enabled: open && mode === 'po_linked' },
  );
  const { data: supplierData, isLoading: supplierLoading } = useSuppliers(
    { page: 1, pageSize: DROPDOWN_PAGE_SIZE },
  );

  const purchaseOrders = useMemo(
    () => (poData?.data ?? []).filter((po) => RETURNABLE_PO.has(po.status)),
    [poData],
  );
  const suppliers = supplierData?.data ?? [];
  const selectedPo = purchaseOrders.find((po) => po.id === poId);

  const reset = () => {
    setMode('po_linked');
    setPoId('');
    setSupplierId('');
    setLinesOpen(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const canContinue = mode === 'po_linked' ? Boolean(poId) : Boolean(supplierId);

  return (
    <>
      <FormModal
        open={open && !linesOpen}
        title="Create purchase return"
        onClose={handleClose}
        onSubmit={() => {
          if (canContinue) setLinesOpen(true);
        }}
        submitLabel="Choose products"
        maxWidth="sm"
      >
        <TextField
          select
          fullWidth
          size="small"
          label="Return type"
          value={mode}
          onChange={(e) => {
            setMode(e.target.value as PurchaseReturnMode);
            setPoId('');
            setSupplierId('');
          }}
          sx={{ mb: 2 }}
        >
          <MenuItem value="po_linked">Against a purchase order</MenuItem>
          <MenuItem value="supplier">Supplier leftover (no PO)</MenuItem>
        </TextField>

        {mode === 'po_linked' ? (
          <Autocomplete
            options={purchaseOrders}
            loading={poLoading}
            value={selectedPo ?? null}
            onChange={(_, value) => setPoId(value?.id ?? '')}
            getOptionLabel={(po) =>
              `${po.orderNumber} — ${po.supplierName} (${po.status})`
            }
            renderInput={(params) => (
              <TextField {...params} size="small" label="Purchase order" placeholder="Search PO" />
            )}
          />
        ) : (
          <Autocomplete
            options={suppliers}
            loading={supplierLoading}
            value={suppliers.find((s) => s.id === supplierId) ?? null}
            onChange={(_, value) => setSupplierId(value?.id ?? '')}
            getOptionLabel={(s) => s.name}
            renderInput={(params) => (
              <TextField {...params} size="small" label="Supplier" placeholder="Search supplier" />
            )}
          />
        )}
      </FormModal>

      <PoReturnDialog
        open={linesOpen && mode === 'po_linked' && Boolean(poId)}
        purchaseOrderId={poId}
        amountPaid={selectedPo?.amountPaid ?? 0}
        onClose={() => {
          setLinesOpen(false);
          handleClose();
        }}
      />
      <SupplierReturnDialog
        open={linesOpen && mode === 'supplier' && Boolean(supplierId)}
        supplierId={supplierId}
        onClose={() => {
          setLinesOpen(false);
          handleClose();
        }}
      />
    </>
  );
}
