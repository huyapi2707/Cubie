
import { useState } from 'react';
import { Settings2, Languages, MonitorSpeaker, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GeneralTab } from '@/components/functional/general-tab';
import { TranslationTab } from '@/components/functional/translation-tab';
import { DeviceTab } from '@/components/functional/device-tab';
import { HelpTab } from '@/components/functional/help-tab';

type SettingsTab = 'general' | 'translation' | 'device' | 'help';

const TABS: { id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'translation', label: 'Translation', icon: Languages },
  { id: 'device', label: 'Device', icon: MonitorSpeaker },
  { id: 'help', label: 'Help', icon: HelpCircle },
];

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  return (
    <div className="space-y-6 animate-enter">
      <div>
        <h1 className="text-3xl font-bold tracking-tight font-display">Settings</h1>
        <p className="mt-1 text-muted-foreground">Configure your application preferences</p>
      </div>

      {/* Tab Navigation */}
      <div className="w-full border-b border-border/50">
        <nav className="flex gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors duration-200',
                  isActive
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className={cn('h-4 w-4', isActive && 'text-primary')} />
                {tab.label}
                {/* Active indicator */}
                <span
                  className={cn(
                    'absolute inset-x-0 -bottom-px h-0.5 rounded-full transition-all duration-200',
                    isActive
                      ? 'bg-primary opacity-100'
                      : 'bg-transparent opacity-0',
                  )}
                />
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div key={activeTab} className="max-w-2xl space-y-6 animate-enter">
        {activeTab === 'general' && <GeneralTab />}
        {activeTab === 'translation' && <TranslationTab />}
        {activeTab === 'device' && <DeviceTab />}
        {activeTab === 'help' && <HelpTab />}
      </div>
    </div>
  );
}
