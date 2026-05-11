import { SettingsPanel } from '@/components/settings-panel';
import { BrandManager } from '@/components/brand-manager';
import { BrandVoiceSettings } from '@/components/brand-voice-settings';
import { AutopilotSection } from '@/components/autopilot/autopilot-section';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-white mt-1">
          Manage your connected accounts and preferences
        </p>
      </div>
      <SettingsPanel />
      <div className="border-t border-white/5" />
      <BrandVoiceSettings />
      <div className="border-t border-white/5" />
      <AutopilotSection />
      <div className="border-t border-white/5" />
      <BrandManager />
    </div>
  );
}
