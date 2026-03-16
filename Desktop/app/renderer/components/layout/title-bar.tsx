import { Minus, Square, X } from 'lucide-react';
import { useElectron } from '@/hooks';
import { cn } from '@/lib/utils';

/**
 * Custom frameless title bar with window controls.
 * Uses -webkit-app-region: drag for native window dragging.
 */
export function TitleBar() {
  const { api } = useElectron();

  return (
    <header className="drag-region flex h-10 items-center justify-between border-b border-border/50 bg-sidebar px-3 select-none">
      {/* App Title */}
      <div className="flex items-center gap-2.5">
        <div className="no-drag flex h-6 w-6 items-center justify-center rounded-md gradient-primary">
          <span className="text-xs font-bold text-white">CB</span>
        </div>
        <span className="text-sm font-semibold text-foreground/80 tracking-wide">
          Cubie
        </span>
      </div>

      {/* Window Controls */}
      <div className="no-drag flex items-center gap-0.5">
        <WindowButton
          icon={<Minus className="h-3.5 w-3.5" />}
          onClick={() => api?.window.minimize()}
          label="Minimize"
        />
        <WindowButton
          icon={<Square className="h-3 w-3" />}
          onClick={() => api?.window.maximize()}
          label="Maximize"
        />
        <WindowButton
          icon={<X className="h-4 w-4" />}
          onClick={() => api?.window.close()}
          label="Close"
          variant="destructive"
        />
      </div>
    </header>
  );
}

function WindowButton({
  icon,
  onClick,
  label,
  variant = 'default',
}: {
  icon: React.ReactNode;
  onClick?: () => void;
  label: string;
  variant?: 'default' | 'destructive';
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={cn(
        'flex h-8 w-10 items-center justify-center rounded-sm text-muted-foreground transition-colors duration-150',
        variant === 'destructive'
          ? 'hover:bg-destructive hover:text-white'
          : 'hover:bg-accent hover:text-foreground',
      )}
    >
      {icon}
    </button>
  );
}
