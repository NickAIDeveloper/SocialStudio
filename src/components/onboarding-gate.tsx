'use client';

import { useState, useEffect } from 'react';
import { OnboardingWizard } from '@/components/onboarding-wizard';

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const [showWizard, setShowWizard] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkOnboarding() {
      try {
        const res = await fetch('/api/preferences');
        if (!res.ok) {
          setLoading(false);
          return;
        }

        const json = await res.json();
        if (json.success && json.data) {
          setShowWizard(json.data.onboardingCompleted === false);
        }
      } catch {
        // If fetch fails, don't block the dashboard
      } finally {
        setLoading(false);
      }
    }
    checkOnboarding();
  }, []);

  const handleComplete = () => {
    setShowWizard(false);
  };

  if (loading) {
    return <>{children}</>;
  }

  return (
    <>
      {showWizard && <OnboardingWizard onComplete={handleComplete} />}
      {children}
    </>
  );
}
