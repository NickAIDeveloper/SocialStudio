'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function Redirect() {
  const router = useRouter();
  const sp = useSearchParams();
  useEffect(() => {
    const next = new URLSearchParams(sp.toString());
    next.set('tab', 'competitors');
    router.replace(`/analyze?${next.toString()}`, { scroll: false });
  }, [router, sp]);
  return null;
}

export default function CompetitorsPage() {
  return (
    <Suspense fallback={null}>
      <Redirect />
    </Suspense>
  );
}
