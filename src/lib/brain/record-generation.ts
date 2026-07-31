// src/lib/brain/record-generation.ts
//
// Best-effort capture of what went INTO a generation, for the creative-stats
// loop (M2). Deliberately isolated from the hot path in two ways:
//
//   1. It writes to its own table, so it touches nothing `posts` depends on.
//   2. It NEVER throws. Analytics capture failing must not cost a post — the
//      same rule the brain context already follows in smart-posts/generate.ts.
//
// Every field is optional because the callers differ: autopilot knows its
// grade and image provider, a discarded best-of-N candidate has no postId,
// and older surfaces may know very little. Recording a partial row is better
// than recording nothing.

import { db } from '@/lib/db';
import { creativeGenerations } from '@/lib/db/schema';
import { classifyHookPattern } from './creative-stats';

export interface GenerationRecord {
  brandId: string;
  surface: 'autopilot' | 'smart-posts' | 'batch' | 'ads';
  postId?: string | null;
  model?: string | null;
  angle?: string | null;
  hookText?: string | null;
  contentType?: string | null;
  overlayStyle?: string | null;
  imageProvider?: string | null;
  imageQuery?: string | null;
  gradeScore?: number | null;
  discardedReason?: string | null;
  godModeFellBack?: boolean;
}

export async function recordCreativeGeneration(record: GenerationRecord): Promise<void> {
  try {
    await db.insert(creativeGenerations).values({
      brandId: record.brandId,
      surface: record.surface,
      postId: record.postId ?? null,
      model: record.model ?? null,
      angle: record.angle ?? null,
      // Derived here rather than at read time so the classification that was
      // current when the post shipped is what we analyse later.
      hookPattern: classifyHookPattern(record.hookText),
      hookText: record.hookText ?? null,
      contentType: record.contentType ?? null,
      overlayStyle: record.overlayStyle ?? null,
      imageProvider: record.imageProvider ?? null,
      imageQuery: record.imageQuery ?? null,
      gradeScore: record.gradeScore ?? null,
      discardedReason: record.discardedReason ?? null,
      godModeFellBack: record.godModeFellBack ?? false,
    });
  } catch (err) {
    console.warn(
      '[creative-stats] failed to record generation:',
      err instanceof Error ? err.message : String(err),
    );
  }
}
