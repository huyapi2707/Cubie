import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout';
import { useAppStore } from '@/store';
import { useTheme } from '@/hooks';
import {
  DashboardPage,
  SettingsPage,
} from '@/components/pages';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

function PageRouter() {
  const activePage = useAppStore((s) => s.activePage);

  switch (activePage) {
    case 'dashboard':
      return <DashboardPage />;
    case 'settings':
      return <SettingsPage />;
    default:
      return <DashboardPage />;
  }
}

export default function App() {
  // Apply theme class to document and listen for main-process changes
  useTheme();

  // Hydrate persisted settings (theme, audio devices) from disk on startup
  const hydrate = useAppStore((s) => s._hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <QueryClientProvider client={queryClient}>
      <AppLayout>
        <PageRouter />
      </AppLayout>
    </QueryClientProvider>
  );
}
