// src/lib/creative/vocabulary.ts
//
// The ingredient vocabulary, as DATA rather than a TypeScript enum.
//
// This is the seam for spec 2 (external DNA injection): adding a competitor
// angle mined from the Ads Library becomes an INSERT with source='ads_library',
// and the scorer, sampler and generator never change. An enum would have made
// that a code change every time.

export type CreativeDimension =
  | 'angle'
  | 'framework'
  | 'pain_point'
  | 'hook_shape'
  | 'cta_type'
  | 'image_style';

export const CREATIVE_DIMENSIONS: readonly CreativeDimension[] = [
  'angle', 'framework', 'pain_point', 'hook_shape', 'cta_type', 'image_style',
];

// Recorded and scored, but never injected into a prompt. image_style has no
// effect until creative is GENERATED rather than selected from stock — see
// spec §10. Recording it now means history exists on the day that lands.
export const RECORD_ONLY_DIMENSIONS: readonly CreativeDimension[] = ['image_style'];

export interface BuiltinIngredient {
  dimension: CreativeDimension;
  value: string;
  promptFragment: string;
}

export const BUILTIN_INGREDIENTS: readonly BuiltinIngredient[] = [
  // ── framework ── the four ad-copy.ts names today
  { dimension: 'framework', value: 'PAS', promptFragment: 'Structure the body as Pain, Agitate, Solution. Name the problem, make it feel present, then resolve it. Never print the stage names.' },
  { dimension: 'framework', value: 'AIDA', promptFragment: 'Structure the body as Attention, Interest, Desire, Action. Best for cold readers who do not yet know the problem. Never print the stage names.' },
  { dimension: 'framework', value: 'BAB', promptFragment: 'Structure the body as Before, After, Bridge. Show the current state, the changed state, then what connects them. Never print the stage names.' },
  { dimension: 'framework', value: 'FOURPS', promptFragment: 'Structure the body as Promise, Picture, Proof, Push. Use only proof you were actually given. Never print the stage names.' },

  // ── angle ── what the creative is ABOUT
  { dimension: 'angle', value: 'curiosity_gap', promptFragment: 'Open a loop the reader needs closed. Raise a question the product answers, and do not answer it in the first line.' },
  { dimension: 'angle', value: 'loss_aversion', promptFragment: 'Frame the cost of NOT acting rather than the upside of acting. What is quietly being lost right now.' },
  { dimension: 'angle', value: 'social_proof', promptFragment: 'Lead with what other people in this situation do. Use ONLY real facts you were given; never invent counts, testimonials or studies.' },
  { dimension: 'angle', value: 'authority', promptFragment: 'Lead with the method or the science behind the product. Explain the mechanism plainly, without inventing studies.' },
  { dimension: 'angle', value: 'pattern_interrupt', promptFragment: 'Break the scroll with an unexpected first line that contradicts what the reader assumes.' },
  { dimension: 'angle', value: 'transformation', promptFragment: 'Centre the change in the person, not the features of the product.' },

  // ── hook_shape ── the SENTENCE FORM of the opening line.
  // Deliberately the same five shapes classifyHookPattern() detects in
  // src/lib/brain/creative-stats.ts, so recorded genomes and measured hook
  // shapes use one vocabulary and can be compared directly.
  { dimension: 'hook_shape', value: 'question', promptFragment: 'Open with a direct question the reader cannot answer without reading on.' },
  { dimension: 'hook_shape', value: 'number', promptFragment: 'Open with a specific number that frames what follows.' },
  { dimension: 'hook_shape', value: 'contrarian', promptFragment: 'Open by contradicting something the reader assumes is true.' },
  { dimension: 'hook_shape', value: 'personal', promptFragment: 'Open with a first-person admission or confession.' },
  { dimension: 'hook_shape', value: 'statement', promptFragment: 'Open with a flat declarative claim.' },

  // ── cta_type ── how the close asks for the tap
  { dimension: 'cta_type', value: 'direct', promptFragment: 'Close by asking for the tap plainly.' },
  { dimension: 'cta_type', value: 'curiosity', promptFragment: 'Close by promising what the reader will SEE once they tap.' },
  { dimension: 'cta_type', value: 'low_friction', promptFragment: 'Close by making the next step feel small and instant.' },
  { dimension: 'cta_type', value: 'outcome', promptFragment: 'Close on the specific result the reader gets, stated concretely.' },

  // ── pain_point ── which researched pain leads. Generic placeholders only:
  // real pains arrive per brand from brand_pain_points at generation time.
  { dimension: 'pain_point', value: 'top_ranked', promptFragment: 'Lead with the single most-referenced pain from the research you were given.' },
  { dimension: 'pain_point', value: 'second_ranked', promptFragment: 'Lead with the SECOND most-referenced pain from the research you were given, not the first.' },

  // ── image_style ── RECORD ONLY. No prompt effect until generated creative.
  { dimension: 'image_style', value: 'stock_photo', promptFragment: 'record-only: selected stock photograph with a text overlay' },
  { dimension: 'image_style', value: 'stock_photo_person', promptFragment: 'record-only: selected stock photograph featuring a person' },
];

export function ingredientsFor(dimension: CreativeDimension): BuiltinIngredient[] {
  return BUILTIN_INGREDIENTS.filter(i => i.dimension === dimension);
}
