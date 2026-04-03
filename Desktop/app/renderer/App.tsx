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
} from '@/components/pages';
import { voiceService } from '@/services/voice-service';

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

  // Global WebSocket listener to process real-time quota updates during streaming
  useEffect(() => {
    const unsubscribe = voiceService.onMessage((message) => {
      if (message.type === 'quota_update') {
        useAppStore.setState({
          quotaInfo: {
            remainingPercent: Number(message.remainingPercent) || 0,
            refreshesAt: String(message.refreshesAt),
          }
        });
      }
    });
    return unsubscribe;
  }, []);

  if (!hydrated) {
    return null; 
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
