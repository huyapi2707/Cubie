import { useState } from 'react';
import { Loader2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store';
import { cn } from '@/lib/utils';
import { TitleBar } from '@/components/layout/title-bar';
import { useNavigate } from 'react-router-dom';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const setAuth = useAppStore((s) => s.setAuth);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!email.trim()) {
      setError('Please enter your email');
      return;
    }

    setLoading(true);

    try {
      const voiceConfig = await window.electronAPI.voice.getConfig();
      if (!voiceConfig || !voiceConfig.httpUrl) {
        throw new Error('VoiceWorker httpUrl is not configured.');
      }

      const res = await fetch(`${voiceConfig.httpUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      if (!data.token || !data.user) {
        throw new Error('Invalid response from server');
      }

      // Store in App state and persist to electron store
      setAuth(data.token, data.user);
      navigate('/');
    } catch (err: any) {
      console.error('[Login] Error:', err);
      setError(err.message || 'Failed to connect to authentication server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      <TitleBar />
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm">
        <div className="flex flex-col items-center space-y-2 mb-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 mb-2">
            <Zap className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome to Cubie</h1>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-4 rounded-xl border border-border/50 bg-card p-6 shadow-sm">
            <div className="space-y-2 flex flex-col">
              <label htmlFor="email" className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors focus-visible:ring-primary/50"
                required
              />
            </div>

            <div className="space-y-2 flex flex-col">
              <label htmlFor="password" className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors focus-visible:ring-primary/50"
                required
              />
            </div>

            <div className={cn(
              "text-[13px] font-medium text-destructive transition-all duration-300 overflow-hidden",
              error ? "max-h-20 opacity-100 mt-2" : "max-h-0 opacity-0 m-0"
            )}>
              {error}
            </div>
            
            <Button 
              type="submit" 
              className="w-full h-10 font-medium transition-transform hover:scale-[1.02]" 
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Authenticating…
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
    </div>
  );
}
