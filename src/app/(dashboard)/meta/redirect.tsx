'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export function MetaRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (!params.has('source')) {
      params.set('source', 'meta');
    }
    router.replace(`/analyze?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  return null;
}
