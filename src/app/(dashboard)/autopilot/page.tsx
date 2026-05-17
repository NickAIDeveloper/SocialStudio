import { AutopilotSection } from '@/components/autopilot/autopilot-section';

export default function AutopilotPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Autopilot</h1>
        <p className="text-sm text-white mt-1">
          Automatically generate and schedule posts for each brand.
        </p>
      </div>
      <AutopilotSection />
    </div>
  );
}
