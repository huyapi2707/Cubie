import { Moon, Sun, Monitor, Wifi } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks';
import { useAppStore } from '@/store';
import { cn } from '@/lib/utils';
import type { ThemeMode } from '@shared/ipc';

const themeOptions: { value: ThemeMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function GeneralTab() {
  const { theme, setThemeMode } = useTheme();
  const autoReconnect = useAppStore((s) => s.autoReconnect);
  const setAutoReconnect = useAppStore((s) => s.setAutoReconnect);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">General</h2>
        <p className="text-sm text-muted-foreground">Customize appearance and connection behavior</p>
      </div>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
          <CardDescription>Customize the look and feel of the application</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Theme</label>
            <p className="text-xs text-muted-foreground mb-3">
              Select your preferred color scheme
            </p>
            <div className="flex gap-2">
              {themeOptions.map((option) => {
                const Icon = option.icon;
                const active = theme === option.value;
                return (
                  <Button
                    key={option.value}
                    variant={active ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setThemeMode(option.value)}
                    className={cn(
                      'gap-2 transition-all',
                      active && 'shadow-md shadow-primary/25',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {option.label}
                  </Button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connection</CardTitle>
          <CardDescription>Configure server connection behavior</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Wifi className="h-4 w-4 text-muted-foreground" />
              <div>
                <label className="text-sm font-medium">Auto Reconnect</label>
                <p className="text-xs text-muted-foreground">
                  Automatically reconnect when the connection is lost
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoReconnect}
              onClick={() => setAutoReconnect(!autoReconnect)}
              className={cn(
                'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                autoReconnect ? 'bg-primary' : 'bg-muted',
              )}
            >
              <span
                className={cn(
                  'pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
                  autoReconnect ? 'translate-x-[18px]' : 'translate-x-0.5',
                )}
              />
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
