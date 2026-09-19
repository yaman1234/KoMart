import { useState } from 'react';
import { Box, Button, IconButton, ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import InventoryIcon from '@mui/icons-material/Inventory';
import PaymentsIcon from '@mui/icons-material/Payments';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import SendIcon from '@mui/icons-material/Send';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BlockIcon from '@mui/icons-material/Block';
import type { PurchaseOrder, PurchaseOrderStatus, UserRole } from '@/types';
import { canEditPurchaseOrder } from '@/utils/canEditPurchaseOrder';
import { PO_REQUIRE_APPROVAL } from '@/pages/purchase-orders/poTerminology';

interface PoDetailActionsProps {
  po: PurchaseOrder;
  userRole?: UserRole;
  canManage: boolean;
  canReceive: boolean;
  canPay: boolean;
  canReturn: boolean;
  canCancel: boolean;
  workflowBusy: boolean;
  receivePending?: boolean;
  receiveDisabled?: boolean;
  placeOrderPending?: boolean;
  onBack: () => void;
  onEdit: () => void;
  onPlaceOrder?: () => void;
  onWorkflow: (action: 'submit' | 'approve' | 'reject' | 'send' | 'close') => void;
  onReceive?: () => void;
  onPay: () => void;
  onReturn: () => void;
  onCancel: () => void;
}

export function PoDetailActions({
  po,
  userRole,
  canManage,
  canReceive,
  canPay,
  canReturn,
  canCancel,
  workflowBusy,
  receivePending = false,
  receiveDisabled = true,
  placeOrderPending = false,
  onBack,
  onEdit,
  onPlaceOrder,
  onWorkflow,
  onReceive,
  onPay,
  onReturn,
  onCancel,
}: PoDetailActionsProps) {
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const status: PurchaseOrderStatus = po.status;
  const canEdit = canEditPurchaseOrder(po, userRole);
  const showFormalApproval = PO_REQUIRE_APPROVAL
    || status === 'pending_approval'
    || status === 'approved'
    || status === 'rejected';

  let primary: React.ReactNode = null;
  if (canManage && status === 'draft' && onPlaceOrder) {
    primary = (
      <Button
        variant="contained"
        disabled={workflowBusy || placeOrderPending}
        loading={placeOrderPending}
        onClick={onPlaceOrder}
      >
        Place Order
      </Button>
    );
  } else if (canManage && showFormalApproval && status === 'pending_approval') {
    primary = (
      <Button variant="contained" disabled={workflowBusy} onClick={() => onWorkflow('approve')}>
        Approve
      </Button>
    );
  } else if (canManage && showFormalApproval && status === 'approved') {
    primary = (
      <Button variant="contained" disabled={workflowBusy} onClick={() => onWorkflow('send')}>
        Send to supplier
      </Button>
    );
  } else if (canManage && canReceive && onReceive) {
    primary = (
      <Button
        variant="contained"
        startIcon={<InventoryIcon />}
        onClick={onReceive}
        loading={receivePending}
        disabled={receiveDisabled}
      >
        Process Goods Receipt
      </Button>
    );
  } else if (canPay) {
    primary = (
      <Button variant="contained" startIcon={<PaymentsIcon />} onClick={onPay}>
        Pay invoice
      </Button>
    );
  }

  const closeMenu = () => setMenuAnchor(null);

  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
      {canEdit && (
        <Button variant="outlined" startIcon={<EditIcon />} onClick={onEdit}>
          Edit
        </Button>
      )}
      {primary}
      {canPay && canReceive && (
        <Button variant="outlined" startIcon={<PaymentsIcon />} onClick={onPay}>
          Pay invoice
        </Button>
      )}
      {canManage && showFormalApproval && status === 'pending_approval' && (
        <Button color="error" variant="outlined" disabled={workflowBusy} onClick={() => onWorkflow('reject')}>
          Reject
        </Button>
      )}
      <IconButton size="small" aria-label="More actions" onClick={(e) => setMenuAnchor(e.currentTarget)}>
        <MoreVertIcon />
      </IconButton>
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={closeMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={() => { closeMenu(); onBack(); }}>
          <ListItemIcon><ArrowBackIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Back to list</ListItemText>
        </MenuItem>
        {canManage && status === 'draft' && (
          <MenuItem
            disabled={workflowBusy}
            onClick={() => { closeMenu(); onWorkflow('submit'); }}
          >
            <ListItemIcon><SendIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Submit for approval</ListItemText>
          </MenuItem>
        )}
        {canManage && status === 'received' && (
          <MenuItem
            disabled={workflowBusy}
            onClick={() => { closeMenu(); onWorkflow('close'); }}
          >
            <ListItemIcon><CheckCircleIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Close order</ListItemText>
          </MenuItem>
        )}
        {canManage && showFormalApproval && status === 'approved' && (
          <MenuItem
            disabled={workflowBusy}
            onClick={() => { closeMenu(); onWorkflow('send'); }}
          >
            <ListItemIcon><SendIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Send to supplier</ListItemText>
          </MenuItem>
        )}
        {canManage && showFormalApproval && status === 'pending_approval' && (
          <MenuItem
            disabled={workflowBusy}
            onClick={() => { closeMenu(); onWorkflow('reject'); }}
          >
            <ListItemIcon><BlockIcon fontSize="small" color="error" /></ListItemIcon>
            <ListItemText>Reject</ListItemText>
          </MenuItem>
        )}
        {canPay && (
          <MenuItem onClick={() => { closeMenu(); onPay(); }}>
            <ListItemIcon><PaymentsIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Pay invoice</ListItemText>
          </MenuItem>
        )}
        {canReturn && (
          <MenuItem onClick={() => { closeMenu(); onReturn(); }}>
            <ListItemIcon><AssignmentReturnIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Return to supplier</ListItemText>
          </MenuItem>
        )}
        {canCancel && (
          <MenuItem onClick={() => { closeMenu(); onCancel(); }}>
            <ListItemIcon><CancelOutlinedIcon fontSize="small" color="error" /></ListItemIcon>
            <ListItemText sx={{ color: 'error.main' }}>Cancel order</ListItemText>
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
}
