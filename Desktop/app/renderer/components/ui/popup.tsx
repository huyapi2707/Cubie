import { usePopupStore } from '@/store';
import { X, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

const typeConfig = {
  error: {
    icon: AlertCircle,
    color: 'text-destructive',
    bg: 'bg-background border-destructive text-foreground',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-amber-500',
    bg: 'bg-background border-amber-500/50 text-foreground',
  },
  info: {
    icon: Info,
    color: 'text-blue-500',
    bg: 'bg-background border-blue-500/50 text-foreground',
  },
};

export function PopupContainer() {
  const popups = usePopupStore((s) => s.popups);
  const removePopup = usePopupStore((s) => s.removePopup);

  if (popups.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-3 max-w-sm w-full">
      {popups.map((popup) => {
        const config = typeConfig[popup.type];
        const Icon = config.icon;

        return (
          <div
            key={popup.id}
            className={cn(
              'flex items-start gap-3 rounded-lg border p-4 shadow-xl animate-in fade-in-0 slide-in-from-bottom-5',
              config.bg
            )}
          >
            <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', config.color)} />
            <div className="flex-1 space-y-1">
              {popup.title && (
                <h4 className={cn('text-sm font-semibold leading-none', config.color)}>
                  {popup.title}
                </h4>
              )}
              <p className="text-sm opacity-90 leading-relaxed font-medium">{popup.message}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 -mt-1 -mr-2 text-muted-foreground hover:bg-muted/50"
              onClick={() => removePopup(popup.id)}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        );
      })}
    </div>
  );
}
