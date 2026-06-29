import { useState, useEffect } from 'react';
import { Box, Tab, Tabs, Alert } from '@mui/material';
import StoreIcon from '@mui/icons-material/Store';
import PeopleIcon from '@mui/icons-material/People';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { useAuthStore } from '@/store';
import { isAdmin } from '@/utils';
import { StoreInfoTab } from './tabs/StoreInfoTab';
import { UsersTab } from './tabs/UsersTab';
import { CategoriesTab } from './tabs/CategoriesTab';

type TabKey = 'store' | 'users' | 'categories';

const TAB_ORDER: TabKey[] = ['store', 'users', 'categories'];

export function SettingsPage() {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const adminOnly = isAdmin(user?.role);

  const initialTab = (tab as TabKey) ?? 'store';
  const [activeTab, setActiveTab] = useState<TabKey>(
    TAB_ORDER.includes(initialTab as TabKey) ? (initialTab as TabKey) : 'store',
  );

  useEffect(() => {
    if (tab && TAB_ORDER.includes(tab as TabKey)) {
      setActiveTab(tab as TabKey);
    }
  }, [tab]);

  const handleTabChange = (_: React.SyntheticEvent, newValue: TabKey) => {
    setActiveTab(newValue);
    navigate(`/settings/${newValue}`, { replace: true });
  };

  return (
    <Box>
      <PageHeader title="Settings" subtitle="Store configuration, users, and categories" />

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={handleTabChange}>
          <Tab
            value="store"
            label="Store Info"
            icon={<StoreIcon />}
            iconPosition="start"
          />
          {adminOnly && (
            <Tab
              value="users"
              label="Users"
              icon={<PeopleIcon />}
              iconPosition="start"
            />
          )}
          <Tab
            value="categories"
            label="Categories"
            icon={<LocalOfferIcon />}
            iconPosition="start"
          />
        </Tabs>
      </Box>

      {activeTab === 'store' && <StoreInfoTab />}
      {activeTab === 'users' && (
        adminOnly ? (
          <UsersTab />
        ) : (
          <Alert severity="error">Admin access required to manage users.</Alert>
        )
      )}
      {activeTab === 'categories' && <CategoriesTab />}
    </Box>
  );
}
