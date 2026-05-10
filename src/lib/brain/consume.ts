import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brandBrain } from '@/lib/db/schema';
import { parseFormula } from './brief-parser';
import type { BrainContext, IgFormat } from './types';

export async function readBrandBrain(brandId: string): Promise<BrainContext | null> {
  const [row] = await db.select().from(brandBrain).where(eq(brandBrain.brandId, brandId));
  if (!row) return null;
  return {
    briefMd: row.briefMd,
    formula: parseFormula(row.briefMd),
    briefVersion: row.briefVersion,
    generatedAt: row.generatedAt.toISOString(),
  };
}

export interface GenerateContextIn {
  systemPrompt: string;
  userFormat: IgFormat | null;
  userSlot: { dow: number; hour: number } | null;
}

export interface GenerateContextOut {
  systemPrompt: string;
  format: IgFormat | null;
  slot: { dow: number; hour: number } | null;
  captionShapeHint: { lines: number; paragraphs: number; emojiDensity: 'low' | 'medium' | 'high' } | null;
}

export function mergeBrainIntoContext(
  input: GenerateContextIn,
  brain: BrainContext | null
): GenerateContextOut {
  if (!brain) {
    return {
      systemPrompt: input.systemPrompt,
      format: input.userFormat,
      slot: input.userSlot,
      captionShapeHint: null,
    };
  }
  return {
    systemPrompt: `${input.systemPrompt}\n\nBRAND BRAIN (v${brain.briefVersion}, ${brain.generatedAt}):\n${brain.briefMd}`,
    format: input.userFormat ?? brain.formula?.format ?? null,
    slot: input.userSlot ?? brain.formula?.bestSlot ?? null,
    captionShapeHint: brain.formula?.captionShape ?? null,
  };
}
