import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  Alert,
  CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CategoryIcon from '@mui/icons-material/LocalOffer';
import { useCategories, useCreateCategory, useUpdateCategory } from '@/hooks/useCategories';
import { getErrorMessage } from '@/services/apiClient';
import { showSuccess } from '@/utils/toast';
import type { Category } from '@/types';

export function CategoriesTab() {
  const { data: categories = [], isLoading, isError, error: loadError } = useCategories(true);
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [error, setError] = useState('');

  const openEdit = (cat: Category) => {
    setEditTarget(cat);
    setEditName(cat.name);
    setEditDesc(cat.description);
    setError('');
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setError('');
    try {
      await createMutation.mutateAsync({ name: newName.trim(), description: newDesc.trim() });
      showSuccess('Category created.');
      setAddOpen(false);
      setNewName('');
      setNewDesc('');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleUpdate = async () => {
    if (!editTarget) return;
    setError('');
    try {
      await updateMutation.mutateAsync({
        id: editTarget.id,
        name: editName.trim(),
        description: editDesc.trim(),
      });
      showSuccess('Category updated.');
      setEditTarget(null);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleToggleActive = async (cat: Category) => {
    setError('');
    try {
      await updateMutation.mutateAsync({ id: cat.id, is_active: !cat.isActive });
      showSuccess(cat.isActive ? 'Category deactivated.' : 'Category activated.');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

<<<<<<< HEAD
=======
  const handleDeactivate = async (id: string) => {
    setError('');
    try {
      await deleteMutation.mutateAsync(id);
      showSuccess('Category deleted.');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

>>>>>>> dev
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CategoryIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Product Categories</Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => { setAddOpen(true); setNewName(''); setNewDesc(''); setError(''); }}
        >
          Add Category
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {getErrorMessage(loadError)}
        </Alert>
      )}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {categories.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center">
                    <Typography color="text.secondary" sx={{ py: 2 }}>
                      No categories yet. Add one to use in product forms and filters.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
              categories.map((cat) => (
                <TableRow key={cat.id} sx={{ opacity: cat.isActive ? 1 : 0.5 }}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{cat.name}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {cat.description || '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={cat.isActive ? 'Active' : 'Inactive'}
                      color={cat.isActive ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEdit(cat)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={cat.isActive ? 'Deactivate' : 'Activate'}>
                        <IconButton
                          size="small"
                          color={cat.isActive ? 'warning' : 'success'}
                          onClick={() => handleToggleActive(cat)}
                        >
                          {cat.isActive ? <BlockIcon fontSize="small" /> : <CheckCircleIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Add Category Dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Category</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{error}</Alert>}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Category Name"
              fullWidth
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
            <TextField
              label="Description (optional)"
              fullWidth
              multiline
              rows={2}
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            loading={createMutation.isPending}
            onClick={handleCreate}
            disabled={!newName.trim()}
          >
            Add Category
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Category Dialog */}
      <Dialog open={!!editTarget} onClose={() => setEditTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Category — {editTarget?.name}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{error}</Alert>}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Category Name"
              fullWidth
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              autoFocus
            />
            <TextField
              label="Description (optional)"
              fullWidth
              multiline
              rows={2}
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditTarget(null)}>Cancel</Button>
          <Button
            variant="contained"
            loading={updateMutation.isPending}
            onClick={handleUpdate}
            disabled={!editName.trim()}
          >
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
