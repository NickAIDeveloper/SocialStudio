'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export function MetaRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    // Add source=meta only if not already present
    if (!params.has('source')) {
      params.set('source', 'meta');
    }
    const redirectUrl = `/analytics?${params.toString()}`;
    router.replace(redirectUrl, { scroll: false });
  }, [router, searchParams]);

  return null;
}
