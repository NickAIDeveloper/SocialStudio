'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function Redirect() {
  const router = useRouter();
  const sp = useSearchParams();
  useEffect(() => {
    const q = sp.toString();
    router.replace(q ? `/analyze?${q}` : '/analyze', { scroll: false });
  }, [router, sp]);
  return null;
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={null}>
      <Redirect />
    </Suspense>
  );
}
