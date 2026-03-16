import { TitleBar } from './title-bar';
import { Sidebar } from './sidebar';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AppLayoutProps {
  children: React.ReactNode;
}

/**
 * Root application layout with frameless title bar, sidebar, and content area.
 */
export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      {/* Title Bar */}
      <TitleBar />

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Navigation */}
        <Sidebar />

        {/* Content Panel */}
        <main className="flex-1 overflow-hidden">
          <ScrollArea className="h-full flex flex-col">
            <div className="p-6 flex-1">{children}</div>
          </ScrollArea>
        </main>
      </div>
    </div>
  );
}
