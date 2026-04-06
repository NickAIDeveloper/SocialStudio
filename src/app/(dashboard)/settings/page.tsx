import { SettingsPanel } from '@/components/settings-panel';
import { BrandManager } from '@/components/brand-manager';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Manage your connected accounts and preferences
        </p>
      </div>
      <SettingsPanel />
      <div className="border-t border-white/5" />
      <BrandManager />
    </div>
  );
}
