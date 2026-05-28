// Image candidate scoring helpers used by `generateFromSeed`.
//
// Why this exists:
//   Pixabay returns up to 50 candidates per query. Even with a good search term,
//   some results are pure landscape stock (frost, twigs, mountains) that have
//   nothing to do with the caption topic. Without scoring, generate.ts picks
//   candidates[0] — whatever Pixabay ranked first — which produced the "house
//   in a field" image for an Affectly "study habits" caption that the user
//   reported.
//
// What it does:
//   - Tokenizes the hook + caption + brand description into a context token set
//   - Counts overlap between each candidate's `tags` field and that set
//   - Reorders candidates so highest-overlap photos come first
//   - Optionally rejects pure-landscape photos when better options exist

const STOPWORDS = new Set([
  'this', 'that', 'with', 'from', 'your', 'have', 'will', 'more', 'just',
  'some', 'when', 'what', 'they', 'them', 'their', 'there', 'these', 'those',
  'into', 'about', 'than', 'then', 'been', 'being', 'were', 'which', 'would',
  'could', 'should', 'like', 'make', 'made', 'also', 'only', 'still', 'even',
  'much', 'every', 'each', 'most', 'other', 'where', 'while', 'after', 'before',
  'because', 'between', 'through', 'during', 'against', 'over', 'under', 'again',
]);

// Tags that signal a pure-landscape / abstract-nature photo with no human
// subject. When a candidate's tags are dominated by these AND a better
// candidate exists, we skip it.
const LANDSCAPE_TAGS = new Set([
  'landscape', 'scenery', 'nature', 'sky', 'cloud', 'clouds', 'sunset', 'sunrise',
  'mountain', 'mountains', 'forest', 'tree', 'trees', 'field', 'fields', 'meadow',
  'lake', 'ocean', 'sea', 'beach', 'river', 'waterfall', 'desert', 'horizon',
  'frost', 'twig', 'twigs', 'leaf', 'leaves', 'branch', 'branches', 'wave',
  'waves', 'pebble', 'pebbles', 'sand', 'snow', 'ice', 'fog', 'mist', 'dawn',
  'dusk', 'rural', 'countryside', 'panorama', 'horizon', 'cliff', 'valley',
]);

// Per-brand "domain tokens" — Pixabay tag words that signal the photo is
// actually on-topic for the brand's niche. The hook+caption tokens alone
// often fail to overlap with image tags when the copy is metaphorical
// (e.g. "Most runners hit a wall" — no Pixabay tag says "wall" for running
// photos). The brand-domain set is the literal vocabulary an on-topic
// photo would use. Used as a HARD floor: candidates with zero brand-domain
// overlap are demoted below those with any overlap.
//
// Discipline: ONLY include tokens that are highly specific to the niche.
// Generic lifestyle tokens (book, desk, laptop, reading, pen, notebook)
// appear on flower/coffee/decor stock photos and silently admit off-topic
// candidates — that's how a carnation-in-a-cup photo won "Your pace is a
// myth" for affectly. Tokens here must mean "this photo shows the activity",
// not "this object might be in the same room as the activity".
const BRAND_DOMAIN_TOKENS: Record<string, Set<string>> = {
  pacebrain: new Set([
    'run', 'runner', 'runners', 'running', 'jog', 'jogger', 'jogging',
    'marathon', 'sprint', 'sprinter', 'athlete', 'athletic', 'athletics',
    'sport', 'sports', 'fitness', 'workout', 'training', 'cardio', 'treadmill',
    'racing', 'race', 'track', 'trail', 'outdoor', 'exercise', 'stamina',
    'endurance', 'pace', 'shoe', 'shoes', 'sneaker', 'sneakers', 'gym',
  ]),
  affectly: new Set([
    'student', 'students', 'study', 'studying', 'studies',
    'learn', 'learner', 'learning',
    'education', 'educational', 'school',
    'university', 'college', 'classroom',
    'library', 'campus', 'academic',
    'homework', 'lecture', 'exam', 'tutor', 'tutoring',
  ]),
};

// Per-brand "negative tokens" — visual subjects that disqualify a photo
// regardless of accidental positive-token overlap. A photo tagged
// "flower, vase, cup, book, table" gets brand-domain-true off the stray
// "book" — but the photo is clearly a floral still-life, not a study
// scene. Listing the dominant subject vocabulary here (flower, bouquet,
// food, wedding, etc.) lets us reject those at the floor.
//
// Conservative on purpose: only include tokens that signal "this is the
// photo's actual subject" — not incidental props. Coffee, for instance,
// is NOT here because studying photos commonly include a coffee cup.
const SHARED_NEGATIVE_TOKENS = [
  'flower', 'flowers', 'floral', 'bouquet', 'vase', 'rose', 'roses',
  'carnation', 'tulip', 'tulips', 'daisy', 'petal', 'petals', 'blossom',
  'wedding', 'bride', 'groom',
  'fashion', 'model', 'glamour', 'makeup',
  'dessert', 'cake', 'pastry', 'cocktail',
  'kitten', 'puppy',
  'baby', 'infant', 'newborn', 'toddler',
];

// PaceBrain-only negatives: study / office / reading subjects. A genuine
// running photo is NEVER tagged with these, but off-domain stock (books,
// desks, laptops, office scenes) frequently carries a stray generic
// "training" tag — Pixabay tags book photos "training, to learn" — which
// would otherwise satisfy the running-domain floor and ship a reading photo
// for a running brand (the user's "weird photo" complaint: a book photo won
// "3 secrets your pace hides"). These tokens are exactly Affectly's domain,
// so they MUST stay PaceBrain-specific and never go in the shared set.
//
// Excluded on purpose: "education"/"school"/"student" — those appear on
// legitimate track/playground photos ("life physical education", student
// athletes) and would reject valid running shots.
const PACEBRAIN_NEGATIVE_TOKENS = [
  'book', 'books', 'read', 'reading', 'literature', 'novel', 'pages', 'bookshelf',
  'library', 'homework', 'classroom', 'lecture', 'professor', 'teacher', 'tutor',
  'exam', 'essay', 'notebook', 'document', 'handwriting', 'paperwork',
  'pen', 'write', 'writing',
  'office', 'desk', 'business', 'meeting', 'corporate',
  'laptop', 'keyboard', 'computer', 'coding', 'programming', 'software', 'hacker',
  // Motor sports. PaceBrain's positive set has 'race', 'racing', 'track' — all of
  // which also describe car/bike racing. Without these negatives a Formula 1 photo
  // (tagged "race, racing, car, motorsport, track") passes the brand-domain floor
  // and ships for a running-pace caption — the user reported "Race predictions you
  // can trust" landing on a vintage F1 photo. These tokens identify the photo as a
  // vehicle scene; legitimate running shots are never tagged with them.
  //
  // Discipline: motorsport-only vocabulary. Avoid generic words (engine, wheel,
  // tire) that appear on wheelchair athletes, crossfit tire flips, or treadmill
  // photos. Avoid 'bike'/'cycling' — runners cross-train and cycling stock can
  // legitimately illustrate endurance content.
  'car', 'cars', 'auto', 'autos', 'automobile', 'automotive', 'vehicle', 'vehicles',
  'formula', 'f1', 'nascar', 'motorsport', 'motorsports', 'motorcycle', 'motorbike',
  'kart', 'karting', 'raceway', 'racetrack', 'pitstop',
];

const BRAND_NEGATIVE_TOKENS: Record<string, Set<string>> = {
  pacebrain: new Set([...SHARED_NEGATIVE_TOKENS, ...PACEBRAIN_NEGATIVE_TOKENS]),
  affectly: new Set(SHARED_NEGATIVE_TOKENS),
};

export function tokenizeForScoring(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/)) {
    if (raw.length >= 4 && !STOPWORDS.has(raw)) out.add(raw);
  }
  return out;
}

/**
 * Splits a Pixabay tag string ("running, runner, athlete") into a token set.
 * Multi-word tags are split into individual words so "young woman" matches
 * "woman" in the caption.
 */
export function tagTokens(tags: string | undefined | null): Set<string> {
  if (!tags) return new Set();
  return tokenizeForScoring(tags);
}

export interface ScorableCandidate {
  url: string;
  tags?: string;
}

/**
 * Returns the count of context tokens that appear in the candidate's tags.
 * Higher = more topically relevant.
 */
export function scoreCandidate(
  candidate: ScorableCandidate,
  contextTokens: Set<string>,
): number {
  if (!candidate.tags) return 0;
  const tt = tagTokens(candidate.tags);
  let score = 0;
  for (const tok of tt) {
    if (contextTokens.has(tok)) score++;
  }
  return score;
}

/**
 * Returns true when ALL of the candidate's discernible tags are landscape
 * stopwords. A candidate with at least one non-landscape tag passes.
 */
export function isPureLandscape(tags: string | undefined | null): boolean {
  if (!tags) return false;
  const tokens = tagTokens(tags);
  if (tokens.size === 0) return false;
  for (const t of tokens) {
    if (!LANDSCAPE_TAGS.has(t)) return false;
  }
  return true;
}

/**
 * Returns true when the candidate has at least one tag token that matches
 * the brand's domain vocabulary (e.g. "runner" for pacebrain, "student" for
 * affectly) AND no tag tokens in the brand's negative set (e.g. flower,
 * bouquet, wedding — visual subjects that disqualify the photo regardless
 * of accidental positive overlap). When the brand has no entry in
 * BRAND_DOMAIN_TOKENS we return true for every candidate — domain filtering
 * is opt-in per brand.
 */
export function hasBrandDomainMatch(
  tags: string | undefined | null,
  brandSlug?: string,
): boolean {
  if (!brandSlug) return true;
  const domain = BRAND_DOMAIN_TOKENS[brandSlug];
  if (!domain || domain.size === 0) return true;
  if (!tags) return false;
  const tokens = tagTokens(tags);
  const negatives = BRAND_NEGATIVE_TOKENS[brandSlug];
  if (negatives) {
    for (const t of tokens) {
      if (negatives.has(t)) return false;
    }
  }
  for (const t of tokens) {
    if (domain.has(t)) return true;
  }
  return false;
}

/**
 * Returns true when the brand has a configured domain vocabulary at all.
 * Callers use this to decide whether to do a brand-anchored fallback search
 * when no candidate in the current pool matches.
 */
export function hasBrandDomainConfig(brandSlug?: string): boolean {
  if (!brandSlug) return false;
  const domain = BRAND_DOMAIN_TOKENS[brandSlug];
  return Boolean(domain && domain.size > 0);
}

export interface ScoredCandidate<T extends ScorableCandidate> {
  candidate: T;
  score: number;
  isLandscape: boolean;
  brandDomainMatch: boolean;
}

/**
 * Scores and sorts candidates by relevance descending. The sort priority:
 *   1. brand-domain-match candidates first (HARD floor — guarantees the
 *      picked photo is on-topic for the brand, even when the caption uses
 *      metaphorical language whose tokens won't appear in image tags)
 *   2. non-landscape before landscape
 *   3. higher caption/hook overlap score before lower
 *
 * Brand-domain mismatches and landscape candidates are demoted but never
 * removed entirely — we'd rather show a sub-optimal image than nothing.
 * Callers should check `ranked[0].brandDomainMatch` and trigger a fallback
 * search when it is false.
 */
export function rankCandidates<T extends ScorableCandidate>(
  candidates: T[],
  contextText: string,
  brandSlug?: string,
): ScoredCandidate<T>[] {
  const ctx = tokenizeForScoring(contextText);
  const scored = candidates.map((c) => ({
    candidate: c,
    score: scoreCandidate(c, ctx),
    isLandscape: isPureLandscape(c.tags),
    brandDomainMatch: hasBrandDomainMatch(c.tags, brandSlug),
  }));
  scored.sort((a, b) => {
    if (a.brandDomainMatch !== b.brandDomainMatch) return a.brandDomainMatch ? -1 : 1;
    if (a.isLandscape !== b.isLandscape) return a.isLandscape ? 1 : -1;
    return b.score - a.score;
  });
  return scored;
}
