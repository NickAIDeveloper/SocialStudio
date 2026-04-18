'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function Redirect() {
  const router = useRouter();
  const sp = useSearchParams();
  useEffect(() => {
    const next = new URLSearchParams(sp.toString());
    if (!next.has('mode')) next.set('mode', 'single');
    router.replace(`/create?${next.toString()}`, { scroll: false });
  }, [router, sp]);
  return null;
}

export default function GeneratePage() {
  return (
    <Suspense fallback={null}>
      <Redirect />
    </Suspense>
  );
}
