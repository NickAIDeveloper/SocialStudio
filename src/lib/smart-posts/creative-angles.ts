// Creative-angle engine.
//
// Why this exists:
//   Autopilot captions collapsed into ONE formula ("Your pace is hiding" / "Your
//   X is Y") because the brand's single top-performing opener was fed back into
//   the prompt as a template to clone. Winner copied → copies reinforce the
//   winner → mode collapse (see docs/superpowers/specs/2026-07-03-autopilot-
//   creative-variety-design.md).
//
//   The cure is to stop cloning the winning SENTENCE and instead rotate through
//   genuinely different creative ANGLES, each aware of the last N posts. The
//   engagement-winning *techniques* (curiosity gap, contrarian reframe, direct
//   second-person address) are still carried forward as guidance — the surface
//   (hook wording, structure, topic, image) is forced to change every post.

export type AngleId =
  | 'question'
  | 'stat'
  | 'story'
  | 'myth'
  | 'command'
  | 'confession'
  | 'howto'
  | 'contrarian'
  | 'curiosity'
  | 'metaphor';

export interface CreativeAngle {
  id: AngleId;
  /** Human label shown in the prompt so the model knows the surface form. */
  label: string;
  /** How the 3-6 word overlay hook should feel for this angle. */
  hookGuidance: string;
  /** How the caption body should be structured for this angle. */
  captionGuidance: string;
}

// Brand-agnostic — every angle works for running (PaceBrain) and learning
// (Affectly). `contrarian` is the exact shape that fatigued, so it sits LAST: on
// a COLD start (no recent history) pickLruAngle tie-breaks by array order, so a
// later position means it is chosen last. Once history exists, LRU ranks purely
// by recency-distance — there the real safeguard is that the collapsed "Your X
// is Y" hooks classify to `myth`, which is then de-prioritised as recently-used.
export const CREATIVE_ANGLES: readonly CreativeAngle[] = [
  {
    id: 'question',
    label: 'Provocative question',
    hookGuidance: 'Open the hook with a sharp question the reader cannot answer confidently.',
    captionGuidance: 'Pose the question, sit in the tension, then resolve it with a concrete answer and a CTA.',
  },
  {
    id: 'stat',
    label: 'Concrete number / data point',
    hookGuidance: 'Anchor the hook on a real, specific number or comparison. Never invent statistics.',
    captionGuidance: 'Lead with the number, explain what it really means, then make it actionable.',
  },
  {
    id: 'story',
    label: 'First-person micro-moment',
    hookGuidance: 'Hook with a tiny in-the-moment scene ("Mile 18. Legs gone.").',
    captionGuidance: 'Tell a 3-beat micro-story: setup, turn, lesson. Keep it personal and specific.',
  },
  {
    id: 'myth',
    label: 'Myth-bust',
    hookGuidance: 'Name a widely believed myth and flag it as wrong in a fresh way.',
    captionGuidance: 'State the myth, dismantle it with a real reason, replace it with the truth.',
  },
  {
    id: 'command',
    label: 'Direct imperative',
    hookGuidance: 'Give one punchy command ("Stop chasing splits.").',
    captionGuidance: 'Justify the command fast, show what to do instead, end on the payoff.',
  },
  {
    id: 'confession',
    label: 'Vulnerable admission',
    hookGuidance: 'Admit something most people are afraid to say out loud.',
    captionGuidance: 'Confess the struggle, normalize it, then offer the reframe that helped.',
  },
  {
    id: 'howto',
    label: 'Numbered actionable list',
    hookGuidance: 'Promise a concrete number of steps ("3 fixes for dead legs").',
    captionGuidance: 'Deliver EXACTLY that many numbered items, each one line, concrete and doable.',
  },
  {
    id: 'curiosity',
    label: 'Curiosity gap',
    hookGuidance: 'Withhold the key detail so the reader has to keep reading to get it.',
    captionGuidance: 'Open the loop in the hook, build a little, then close it near the CTA.',
  },
  {
    id: 'metaphor',
    label: 'Analogy',
    hookGuidance: 'Frame the idea as a vivid analogy from an unrelated domain.',
    captionGuidance: 'Extend the analogy through the body, then land it back on the real point.',
  },
  {
    id: 'contrarian',
    label: 'Hot take',
    hookGuidance: 'A bold contrarian claim — but a genuinely new one, not the recent overused shape.',
    captionGuidance: 'State the hot take, defend it with a real reason, invite the reader to react.',
  },
] as const;

export const ANGLE_IDS: readonly AngleId[] = CREATIVE_ANGLES.map((a) => a.id);

const ANGLE_BY_ID: Readonly<Record<AngleId, CreativeAngle>> = Object.fromEntries(
  CREATIVE_ANGLES.map((a) => [a.id, a]),
) as Record<AngleId, CreativeAngle>;

export function getAngle(id: AngleId): CreativeAngle {
  return ANGLE_BY_ID[id];
}

/**
 * Picks the least-recently-used creative angle given the angles used by recent
 * posts (newest first). An angle absent from the recent list is maximally stale
 * and therefore preferred. Ties (e.g. several never-used angles) are broken
 * deterministically by `seed`, so the same inputs always yield the same angle
 * while different runs still spread across the palette.
 *
 * `recentAngleIds` may contain nulls/unknowns (older posts have no recorded
 * angle) — those are ignored.
 */
export function pickLruAngle(
  recentAngleIds: readonly (AngleId | null | undefined)[] = [],
  seed = 0,
): CreativeAngle {
  // Distance since last use: index in the newest-first list. Not found => Infinity.
  const distance = (id: AngleId): number => {
    const idx = recentAngleIds.findIndex((r) => r === id);
    return idx === -1 ? Number.POSITIVE_INFINITY : idx;
  };

  let best = distance(CREATIVE_ANGLES[0].id);
  const candidates: CreativeAngle[] = [];
  for (const angle of CREATIVE_ANGLES) {
    const d = distance(angle.id);
    if (d > best) {
      best = d;
      candidates.length = 0;
      candidates.push(angle);
    } else if (d === best) {
      candidates.push(angle);
    }
  }
  // Deterministic tie-break. `seed` is a non-negative integer in callers.
  const idx = ((Math.floor(seed) % candidates.length) + candidates.length) % candidates.length;
  return candidates[idx];
}

/**
 * Builds the creative brief injected into the caption prompt. It carries the
 * winning *techniques* forward (so posts keep what performs) while assigning a
 * fresh surface angle and explicitly banning the overused sentence skeleton.
 * Deliberately contains NO literal top-post line to clone.
 */
export function buildCreativeBrief(opts: {
  angle: CreativeAngle;
  winningTechniques?: readonly string[];
  bannedSkeletonHuman?: string | null;
}): string {
  const { angle, winningTechniques = [], bannedSkeletonHuman } = opts;
  const lines: string[] = [];
  if (winningTechniques.length > 0) {
    lines.push(
      `WHAT MAKES THIS BRAND'S TOP POSTS WORK — reuse these TECHNIQUES (the psychology), never the exact words: ${winningTechniques.join('; ')}.`,
    );
  }
  lines.push(`THIS POST'S ANGLE: ${angle.label}. ${angle.hookGuidance}`);
  lines.push(`CAPTION APPROACH: ${angle.captionGuidance}`);
  lines.push(
    'Bring a genuinely NEW topic, metaphor, and piece of information every time — new hook, new specifics, new image subject — while keeping the same underlying techniques that make the top posts land.',
  );
  // The per-CONTENT-TYPE guide elsewhere in the prompt hardcodes its own HOOK
  // STYLE (e.g. the 'quote' type says "a truth bomb" — the exact fatigued shape).
  // Make this angle win so that guidance can't drag the hook back to the collapse.
  lines.push(
    'This ANGLE governs the hook shape. If any CONTENT TYPE or framework guidance elsewhere suggests a different hook style, follow THIS angle instead.',
  );
  if (bannedSkeletonHuman) {
    lines.push(
      `BANNED SHAPE: do NOT write a hook matching "${bannedSkeletonHuman}" — that structure is overused. Use a visibly different sentence structure.`,
    );
  }
  return `\n${lines.join('\n')}\n`;
}
