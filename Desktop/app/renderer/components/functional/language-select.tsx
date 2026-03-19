import { useState, useRef, useEffect } from 'react';
import { Languages, ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export function LanguageSelect({
  languages,
  selected,
  onSelect,
}: {
  languages: { code: string; label: string }[];
  selected: string;
  onSelect: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectedLang = languages.find((l) => l.code === selected);

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
        <Languages className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className={cn('flex-1 text-left truncate', !selected && 'text-muted-foreground')}>
          {selectedLang?.label || 'Select language...'}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-border bg-popover shadow-lg animate-scale-in">
          <div className="max-h-48 overflow-y-auto p-1">
            {languages.map((lang) => {
              const isSelected = selected === lang.code;
              return (
                <button
                  key={lang.code}
                  onClick={() => {
                    onSelect(lang.code);
                    setOpen(false);
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
                  <span className="truncate">{lang.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground uppercase">{lang.code}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
