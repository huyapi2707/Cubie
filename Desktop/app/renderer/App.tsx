import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AppLayout } from '@/components/layout';
import { useAppStore } from '@/store';
import { useTheme } from '@/hooks';
import {
  DashboardPage,
  SettingsPage,
  LoginPage,
  MePage,
  LoadingScreen,
} from '@/components/pages';


function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const hasToken = useAppStore((s) => !!s.jwtToken);
  if (!hasToken) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  // Apply theme class to document and listen for main-process changes
  useTheme();

  // Hydrate persisted settings (theme, audio devices) from disk on startup
  const hydrate = useAppStore((s) => s._hydrate);
  const hydrated = useAppStore((s) => s._hydrated);
  
  useEffect(() => {
    hydrate();
  }, [hydrate]);




  if (!hydrated) {
    return <LoadingScreen />;
  }

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        
        <Route 
          element={
            <ProtectedRoute>
              <AppLayout>
                <Outlet />
              </AppLayout>
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/me" element={<MePage />} />
        </Route>
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
