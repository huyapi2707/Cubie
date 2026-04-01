import {
  LayoutDashboard,
  Settings,
  PanelLeftClose,
  PanelLeft,
  UserCircle,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

// ─── Navigation Items ────────────────────────────────────────────

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const mainNavItems: NavItem[] = [
  { id: '', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'me', label: 'Me', icon: UserCircle },
];

const bottomNavItems: NavItem[] = [
  { id: 'settings', label: 'Settings', icon: Settings },
];

// ─── Sidebar Component ──────────────────────────────────────────

export function Sidebar() {
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const navigate = useNavigate();
  const location = useLocation();
  const activePage = location.pathname.substring(1) || '';


  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 ease-in-out',
        collapsed ? 'w-[60px]' : 'w-[220px]',
      )}
    >
      {/* Toggle Button */}
      <div className="flex h-12 items-center justify-end px-2.5">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="h-8 w-8 text-sidebar-foreground/60 hover:text-sidebar-foreground"
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Main Navigation */}
      <ScrollArea className="flex-1 px-2">
        <nav className="flex flex-col gap-1">
          {mainNavItems.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={activePage === item.id}
              collapsed={collapsed}
              onClick={() => navigate(`/${item.id}`)}
            />
          ))}
        </nav>
      </ScrollArea>

      <Separator className="mx-3 w-auto" />

      {/* Bottom Section */}
      <div className="flex flex-col gap-1 px-2 py-2">

        {/* Bottom Nav */}
        {bottomNavItems.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={activePage === item.id}
            collapsed={collapsed}
            onClick={() => navigate(`/${item.id}`)}
          />
        ))}
      </div>
    </aside>
  );
}

// ─── NavButton ──────────────────────────────────────────────────

function NavButton({
  item,
  active,
  collapsed,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;

  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-all duration-200',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
        collapsed && 'justify-center px-0',
      )}
    >
      {/* Active Indicator */}
      {active && (
        <div className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
      )}

      <Icon className="h-4 w-4 shrink-0" />

      {!collapsed && (
        <>
          <span className="truncate">{item.label}</span>
          {item.badge && (
            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
              {item.badge}
            </span>
          )}
        </>
      )}
    </button>
  );
}
