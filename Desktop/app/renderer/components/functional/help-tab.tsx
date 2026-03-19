import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { InfoRow } from '@/components/functional/info-row';
import { useAppStore } from '@/store';

export function HelpTab() {
  const version = useAppStore((s) => s.version);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">Help</h2>
        <p className="text-sm text-muted-foreground">Application information and support</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">About</CardTitle>
          <CardDescription>Application information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <InfoRow label="Application" value="Cubie" />
          <Separator />
          <InfoRow label="Version" value={version} />
        </CardContent>
      </Card>
    </div>
  );
}
