// src/lib/brain/grade.ts
import type { BrainContext } from './types';

export interface GradeInput {
  brain: BrainContext | null;
  draft: { caption: string; hookText: string };
}

export interface GradeReport {
  score: number;          // 0-10
  strengths: string[];    // 1-3 short bullets
  weaknesses: string[];   // 1-3 short bullets
  suggestions: string[];  // 1-3 short, concrete, actionable bullets
  rationale?: string;     // one short sentence — optional
}

export interface GradePrompt {
  system: string;
  user: string;
}

export function buildGradePrompt(input: GradeInput): GradePrompt {
  const briefSection = input.brain
    ? `Brand Brain (v${input.brain.briefVersion}, ${input.brain.generatedAt}):\n${input.brain.briefMd}`
    : 'No brain available — grade based on Instagram-caption best practices alone.';

  const system = `You grade Instagram post drafts against a brand's strategy brief.
Your job: return a 0-10 score and 3-5 short, specific bullets.

Rules:
- Score is calibrated: 7+ means publishable, 9+ means strong match to brain, 4 or below means scrap and regenerate.
- Strengths: what aligns well. Cite SPECIFIC parts of the draft.
- Weaknesses: what's misaligned with the Formula. Be concrete.
- Suggestions: actionable rewrites. Don't be vague. "Tighten hook to 5 words" beats "make hook punchier."
- If the draft duplicates a closing CTA the brand has used heavily, flag it as fatigue risk.
- Reply with ONLY a valid JSON object matching the schema. No prose outside the JSON.`;

  const user = `${briefSection}

Draft to grade:
HOOK: ${input.draft.hookText}
CAPTION: ${input.draft.caption}

Return JSON in this exact shape:
{
  "score": <number 0-10>,
  "strengths": [<string>, ...],
  "weaknesses": [<string>, ...],
  "suggestions": [<string>, ...],
  "rationale": <one short sentence>
}`;

  return { system, user };
}

const REPAIR_STRIP = /^[^{]*|[^}]*$/g;

export function parseGradeResponse(raw: string): GradeReport | null {
  // Cerebras sometimes wraps JSON in markdown fences or prose. Strip to braces.
  let text = raw.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-z]*\n?/, '').replace(/```\s*$/, '').trim();
  }
  text = text.replace(REPAIR_STRIP, '').trim();
  try {
    const parsed = JSON.parse(text) as Partial<GradeReport>;
    if (typeof parsed.score !== 'number') return null;
    const score = Math.max(0, Math.min(10, parsed.score));
    return {
      score,
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 5) : [],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.slice(0, 5) : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 5) : [],
      rationale: typeof parsed.rationale === 'string' ? parsed.rationale.slice(0, 280) : undefined,
    };
  } catch {
    return null;
  }
}

export interface GradeRunner {
  llmCall: (system: string, user: string) => Promise<string>;
}

export async function runGrade(
  input: GradeInput,
  runner: GradeRunner
): Promise<GradeReport> {
  const { system, user } = buildGradePrompt(input);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await runner.llmCall(system, user);
      const parsed = parseGradeResponse(raw);
      if (parsed) return parsed;
    } catch {
      // continue retry loop
    }
  }
  // Deterministic fallback: empty report so caller can render "grade unavailable"
  return {
    score: 0,
    strengths: [],
    weaknesses: ['Could not generate grade'],
    suggestions: ['Try regenerating the post and grading again'],
  };
}
