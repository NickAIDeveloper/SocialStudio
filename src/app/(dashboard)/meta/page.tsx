'use client';

import { Suspense } from 'react';
import { MetaRedirect } from './redirect';

export default function MetaPage() {
  return (
    <Suspense fallback={null}>
      <MetaRedirect />
    </Suspense>
  );
}
