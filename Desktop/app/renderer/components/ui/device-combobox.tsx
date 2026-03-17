import { useState, useRef, useEffect } from 'react';
import { RefreshCw, ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export function DeviceCombobox({
  devices,
  loading,
  selectedId,
  selectedLabel,
  onSelect,
  placeholder,
  icon,
}: {
  devices: { deviceId: string; label: string }[];
  loading: boolean;
  selectedId: string;
  selectedLabel: string;
  onSelect: (id: string, label: string) => void;
  placeholder: string;
  icon: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = devices.filter((d) =>
    d.label.toLowerCase().includes(search.toLowerCase()),
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg border bg-background px-3 py-2.5 text-sm transition-colors',
          open
            ? 'border-primary ring-1 ring-primary/20'
            : 'border-input hover:border-primary/40',
        )}
      >
        {icon}
        <span className={cn('flex-1 text-left truncate', !selectedId && 'text-muted-foreground')}>
          {loading ? 'Scanning devices...' : selectedLabel || placeholder}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-border bg-popover shadow-lg animate-scale-in">
          <div className="border-b border-border p-2">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search devices..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="max-h-48 overflow-y-auto p-1">
            {loading && (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Scanning...
              </div>
            )}

            {!loading && filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                {search ? 'No matching devices' : 'No devices found'}
              </div>
            )}

            {!loading &&
              filtered.map((device) => {
                const isSelected = selectedId === device.deviceId;
                return (
                  <button
                    key={device.deviceId}
                    onClick={() => {
                      onSelect(device.deviceId, device.label);
                      setOpen(false);
                      setSearch('');
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                      isSelected
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-accent',
                    )}
                  >
                    <Check
                      className={cn(
                        'h-4 w-4 shrink-0',
                        isSelected ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="truncate">{device.label}</span>
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
