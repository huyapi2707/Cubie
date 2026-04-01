import { useAppStore } from '@/store';
import { Button } from '@/components/ui/button';
import { 
  LogOut, 
  Mail, 
  Shield, 
  Activity, 
  Fingerprint,
  CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function MePage() {
  const userInfo = useAppStore((s) => s.userInfo);
  const logout = useAppStore((s) => s.logout);

  if (!userInfo) {
    return null;
  }

  // Generate an initial from name or email
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
              
              <div className="hidden sm:block pb-2">
                <div className="px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 flex items-center gap-2 shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
                  <span className="text-xs font-semibold text-primary uppercase tracking-widest">{userInfo.role || 'Member'}</span>
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
              <Shield className="h-4 w-4" />
              Account Details
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoCard 
                icon={Fingerprint}
                label="Identifier / ID"
                value={userInfo.id}
                className="font-mono text-[13px]"
              />
              <InfoCard 
                icon={Activity}
                label="Translation Quota"
                value={`${userInfo.maxQuota} limits`}
              />
              <InfoCard 
                icon={Shield}
                label="Permission Level"
                value={userInfo.role}
                className="capitalize"
              />
               <InfoCard 
                icon={CheckCircle2}
                label="Account Status"
                value="Active & Secured"
                valueClass="text-emerald-500"
              />
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
