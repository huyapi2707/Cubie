import { useEffect, useState } from 'react';
import { useAppStore } from '@/store';
import { Button } from '@/components/ui/button';
import { 
  LogOut, 
  Mail, 
  Activity, 
  Fingerprint,
  Crown,
  Calendar,
  Timer
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Countdown Hook ─────────────────────────────────────────────────

function useCountdown(targetIso: string | undefined) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!targetIso) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [targetIso]);

  if (!targetIso) return null;

  const diff = Math.max(new Date(targetIso).getTime() - now, 0);
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);

  return { h, m, s, total: diff };
}

// ─── Circular Progress Ring ──────────────────────────────────────────

function QuotaRing({ percent }: { percent: number }) {
  const size = 140;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (percent / 100) * circumference;
  const gap = circumference - filled;

  // Color tiers
  const ringColor =
    percent <= 10
      ? 'hsl(0, 72%, 56%)'    // red — critical
      : percent <= 25
      ? 'hsl(25, 95%, 53%)'   // orange — warning
      : 'hsl(var(--primary))'; // theme primary — healthy

  const glowColor =
    percent <= 10
      ? 'rgba(239,68,68,0.35)'
      : percent <= 25
      ? 'rgba(249,115,22,0.3)'
      : 'rgba(99,102,241,0.25)';

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Subtle glow behind ring */}
      <div
        className="absolute rounded-full blur-2xl pointer-events-none"
        style={{
          width: size * 0.7,
          height: size * 0.7,
          background: glowColor,
        }}
      />

      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
        style={{ filter: `drop-shadow(0 0 6px ${glowColor})` }}
      >
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={stroke}
          opacity={0.25}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={stroke}
          strokeDasharray={`${filled} ${gap}`}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>

      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-3xl font-extrabold tracking-tight"
          style={{ color: ringColor }}
        >
          {percent}%
        </span>
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mt-0.5">
          remaining
        </span>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────

export function MePage() {
  const userInfo = useAppStore((s) => s.userInfo);
  const jwtToken = useAppStore((s) => s.jwtToken);
  const quotaInfo = useAppStore((s) => s.quotaInfo);
  const planInfo = useAppStore((s) => s.planInfo);
  const logout = useAppStore((s) => s.logout);

  const [localQuota, setLocalQuota] = useState(quotaInfo);
  const [localPlan, setLocalPlan] = useState(planInfo);
  const [loadingQuota, setLoadingQuota] = useState(!quotaInfo);

  // Keep local state in sync with store
  useEffect(() => {
    if (quotaInfo) setLocalQuota(quotaInfo);
  }, [quotaInfo]);
  useEffect(() => {
    if (planInfo) setLocalPlan(planInfo);
  }, [planInfo]);

  useEffect(() => {
    async function fetchFreshQuota() {
      if (!jwtToken) return;
      try {
        const config = await window.electronAPI?.voice?.getConfig();
        if (!config?.httpUrl) return;

        const res = await fetch(`${config.httpUrl}/auth/me`, {
          headers: { Authorization: `Bearer ${jwtToken}` },
        });
        
        if (res.ok) {
          const data = await res.json();
          if (data.quota) {
            setLocalQuota(data.quota);
            setLocalPlan(data.plan ?? null);
            useAppStore.setState({ userInfo: data.user, quotaInfo: data.quota, planInfo: data.plan ?? null });
          }
        }
      } catch (err) {
        console.warn('Failed to fetch fresh quota:', err);
      } finally {
        setLoadingQuota(false);
      }
    }
    fetchFreshQuota();
  }, [jwtToken]);

  const countdown = useCountdown(localQuota?.refreshesAt);

  if (!userInfo) {
    return null;
  }

  const initials = (userInfo.name || userInfo.email || 'U').substring(0, 2).toUpperCase();

  return (
    <div className="flex flex-col h-full w-full max-w-5xl mx-auto p-4 md:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col flex-1 gap-8">
        {/* Cover & Header Section */}
        <div className="relative rounded-2xl border border-border/40 bg-card overflow-hidden shadow-sm selection:bg-primary/20">
          {/* Gradient Cover Photo */}
          <div className="h-36 w-full bg-gradient-to-r from-primary/40 via-primary/20 to-background/5 relative overflow-hidden">
             <div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] dark:[mask-image:linear-gradient(0deg,black,rgba(0,0,0,0.6))]" />
          </div>
          
          <div className="px-6 pb-6 lg:px-10">
            {/* Overlapping Avatar */}
            <div className="flex flex-col sm:flex-row justify-between sm:items-end -mt-12 sm:mb-4 gap-4">
              <div className="flex items-center gap-5">
                <div className="h-24 w-24 rounded-2xl bg-background border-4 border-card flex items-center justify-center shadow-lg backdrop-blur-xl relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <span className="text-3xl font-extrabold text-primary tracking-wider z-10">{initials}</span>
                </div>
                <div className="pt-12 sm:pt-14">
                  <h1 className="text-2xl font-bold tracking-tight">{userInfo.name || 'Anonymous User'}</h1>
                  <p className="text-muted-foreground flex items-center gap-1.5 mt-1 text-sm font-medium">
                    <Mail className="h-4 w-4" />
                    {userInfo.email}
                  </p>
                </div>
              </div>
              

            </div>
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Quick Stats / Identifiers */}
          <div className="lg:col-span-2 space-y-6">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider ml-1 flex items-center gap-2">
              <Fingerprint className="h-4 w-4" />
              Account Details
            </h3>
            
            {/* Quota Card — Redesigned */}
            <div className="p-6 rounded-2xl border border-border/40 bg-card shadow-sm col-span-full relative overflow-hidden">
               {/* Decorative background glow */}
               <div className="absolute -top-20 -right-20 w-60 h-60 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

               <div className="flex items-center justify-between mb-6 relative z-10">
                 <div className="flex items-center gap-3">
                   <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                     <Activity className="h-4 w-4" />
                   </div>
                   <h4 className="font-semibold">Quota Status</h4>
                 </div>
                 {loadingQuota && <span className="text-xs text-muted-foreground animate-pulse">Refreshing…</span>}
               </div>

               {localQuota ? (
                 <div className="flex flex-col sm:flex-row items-center gap-8 relative z-10">
                   {/* Circular progress ring */}
                   <QuotaRing percent={localQuota.remainingPercent} />

                   {/* Info side */}
                   <div className="flex-1 space-y-4">
                     {/* Status label */}
                     <div>
                       <p className={cn(
                         "text-sm font-semibold",
                         localQuota.remainingPercent <= 10 ? "text-destructive" :
                         localQuota.remainingPercent <= 25 ? "text-amber-500" :
                         "text-emerald-500"
                       )}>
                         {localQuota.remainingPercent <= 10
                           ? "Quota almost depleted"
                           : localQuota.remainingPercent <= 25
                           ? "Quota running low"
                           : "Quota healthy"}
                       </p>
                       <p className="text-xs text-muted-foreground mt-1">
                         Your quota resets automatically in a rolling window.
                       </p>
                     </div>

                     {/* Countdown */}
                     {countdown && (
                       <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border/30">
                         <Timer className="h-4 w-4 text-muted-foreground shrink-0" />
                         <div>
                           <p className="text-xs text-muted-foreground font-medium">Resets in</p>
                           <p className="text-sm font-bold tracking-wide tabular-nums text-foreground">
                             {String(countdown.h).padStart(2, '0')}
                             <span className="text-muted-foreground mx-0.5">:</span>
                             {String(countdown.m).padStart(2, '0')}
                             <span className="text-muted-foreground mx-0.5">:</span>
                             {String(countdown.s).padStart(2, '0')}
                           </p>
                         </div>
                       </div>
                     )}

                     {/* Thin progress bar (compact duplicate for quick glance) */}
                     <div className="space-y-1.5">
                       <div className="h-1.5 w-full bg-secondary/50 rounded-full overflow-hidden">
                         <div 
                           className={cn(
                             "h-full rounded-full transition-all duration-1000 ease-out",
                             localQuota.remainingPercent <= 10 ? "bg-destructive" :
                             localQuota.remainingPercent <= 25 ? "bg-amber-500" : "bg-primary"
                           )}
                           style={{ width: `${localQuota.remainingPercent}%` }}
                         />
                       </div>
                     </div>
                   </div>
                 </div>
               ) : (
                 <p className="text-sm text-muted-foreground relative z-10">Quota information unavailable.</p>
               )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {localPlan ? (
                <div className="group flex flex-col p-5 rounded-2xl border border-border/40 bg-card hover:bg-accent/30 transition-all duration-300 shadow-sm hover:shadow-md cursor-default">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 group-hover:scale-110 transition-transform duration-300">
                      <Crown className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Current Plan</span>
                  </div>
                  <span className="text-[15px] font-semibold text-foreground">{localPlan.name}</span>
                  {localPlan.description && (
                    <span className="text-xs text-muted-foreground mt-1">{localPlan.description}</span>
                  )}
                  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/30">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>{new Date(localPlan.registeredAt).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Timer className="h-3 w-3" />
                      <span>Expires {new Date(localPlan.expiresAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <InfoCard
                  icon={Crown}
                  label="Current Plan"
                  value="No active plan"
                  valueClass="text-muted-foreground"
                />
              )}
            </div>
          </div>

          {/* Danger Zone */}
          <div className="space-y-6">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider ml-1 flex items-center gap-2">
              <LogOut className="h-4 w-4 text-destructive" />
              Session
            </h3>
            
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 flex flex-col items-start gap-4 shadow-sm relative overflow-hidden transition-all hover:bg-destructive/10">
               <div className="absolute top-0 right-0 w-32 h-32 bg-destructive/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
               <div className="relative z-10 w-full">
                  <h4 className="font-semibold text-destructive flex items-center gap-2">
                    Sign Out
                  </h4>
                  <p className="text-sm text-foreground/70 mt-2 leading-relaxed">
                    End your current session. You will need to re-authenticate to use the translation endpoints again.
                  </p>
               </div>
               <Button 
                variant="destructive" 
                onClick={logout} 
                className="w-full mt-2 shadow-sm font-semibold relative z-10"
              >
                 Log out securely
               </Button>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value, className, valueClass }: any) {
  return (
    <div className="group flex flex-col p-5 rounded-2xl border border-border/40 bg-card hover:bg-accent/30 transition-all duration-300 shadow-sm hover:shadow-md cursor-default">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2.5 rounded-xl bg-primary/10 text-primary group-hover:scale-110 transition-transform duration-300">
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <span className={cn("text-[15px] font-semibold text-foreground truncate", className, valueClass)} title={typeof value === 'string' ? value : undefined}>
        {value}
      </span>
    </div>
  )
}
