import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, TextField, Button, Link, Alert } from '@mui/material';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { authService } from '@/services';
import { getErrorMessage } from '@/services/apiClient';

const schema = z.object({
  email: z.email('Enter a valid email'),
});

type ForgotForm = z.infer<typeof schema>;

export function ForgotPasswordPage() {
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotForm>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: ForgotForm) => {
    setError('');
    try {
      await authService.forgotPassword(data.email);
      setSuccess(true);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  if (success) {
    return (
      <Box>
        <Alert severity="success" sx={{ mb: 2 }}>
          If an account exists for that email, a reset link has been sent.
        </Alert>
        <Link component={RouterLink} to="/login" variant="body2">
          Back to login
        </Link>
      </Box>
    );
  }

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <TextField
        {...register('email')}
        label="Email"
        type="email"
        fullWidth
        margin="normal"
        error={!!errors.email}
        helperText={errors.email?.message}
      />

      <Button
        type="submit"
        variant="contained"
        fullWidth
        size="large"
        loading={isSubmitting}
        sx={{ mt: 3 }}
      >
        Send Reset Link
      </Button>

      <Box sx={{ textAlign: 'center', mt: 2 }}>
        <Link component={RouterLink} to="/login" variant="body2">
          Back to login
        </Link>
      </Box>
    </Box>
  );
}
