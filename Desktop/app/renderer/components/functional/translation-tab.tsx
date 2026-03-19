import { Languages, User, UserRound } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LanguageSelect } from '@/components/functional/language-select';
import { useAppStore } from '@/store';
import { cn } from '@/lib/utils';

const LANGUAGES = [
  { code: 'vi', label: 'Vietnamese' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
  { code: 'th', label: 'Thai' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'es', label: 'Spanish' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ru', label: 'Russian' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
];

const GENDERS: { value: 'male' | 'female' | 'neutral'; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'male', label: 'Male', icon: User },
  { value: 'female', label: 'Female', icon: UserRound },
  { value: 'neutral', label: 'Neutral', icon: Languages },
];

export function TranslationTab() {
  const sourceLanguage = useAppStore((s) => s.sourceLanguage);
  const targetLanguage = useAppStore((s) => s.targetLanguage);
  const setLanguages = useAppStore((s) => s.setLanguages);
  const ttsGender = useAppStore((s) => s.ttsGender);
  const setTtsGender = useAppStore((s) => s.setTtsGender);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">Translation</h2>
        <p className="text-sm text-muted-foreground">Set source and target languages for voice translation</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Languages</CardTitle>
          <CardDescription>Choose the languages for real-time translation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Languages className="h-4 w-4 text-muted-foreground" />
                Source
              </label>
              <p className="text-xs text-muted-foreground">
                Language you speak
              </p>
              <LanguageSelect
                languages={LANGUAGES}
                selected={sourceLanguage}
                onSelect={(code) => setLanguages(code, targetLanguage)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Languages className="h-4 w-4 text-muted-foreground" />
                Target
              </label>
              <p className="text-xs text-muted-foreground">
                Language to translate into
              </p>
              <LanguageSelect
                languages={LANGUAGES}
                selected={targetLanguage}
                onSelect={(code) => setLanguages(sourceLanguage, code)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Voice */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Voice</CardTitle>
          <CardDescription>Choose the voice gender for speech output</CardDescription>
        </CardHeader>
        <CardContent>
          <div>
            <label className="text-sm font-medium">Gender</label>
            <p className="text-xs text-muted-foreground mb-3">
              Select the voice gender for translated speech
            </p>
            <div className="flex gap-2">
              {GENDERS.map((option) => {
                const Icon = option.icon;
                const active = ttsGender === option.value;
                return (
                  <Button
                    key={option.value}
                    variant={active ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTtsGender(option.value)}
                    className={cn(
                      'gap-2 transition-all',
                      active && 'shadow-md shadow-primary/25',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {option.label}
                  </Button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
