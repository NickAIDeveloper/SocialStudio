// src/lib/analytics/questions.ts
//
// Conversational analytics, done safely.
//
// The method demonstrates asking your business data questions in plain English
// ("we're having trouble hitting payroll, what is going wrong?"). The obvious
// implementation is natural-language-to-SQL against production, which is also
// the one way to turn a reporting feature into a data-loss incident: a model
// that can write SELECT can write DELETE, and prompt injection through post
// captions — which this database is full of, all of it scraped from the public
// internet — is a live attack path, not a theoretical one.
//
// So the model never writes SQL. It picks from a fixed registry of questions,
// each backed by a hand-written, parameterised, read-only query. Unmatched
// questions return null rather than an improvised answer: admitting the
// question cannot be answered is strictly better than answering a different
// one convincingly.
//
// This replaces the pile of one-off scripts/diag-*.ts written to answer exactly
// these questions during debugging.

export interface AnalyticsQuestion {
  id: string;
  // Shown to the user; also what the matcher explains it can answer.
  label: string;
  // Words that indicate this question. Matching is keyword-overlap, not a
  // model, so it is deterministic and cannot be talked into anything.
  keywords: string[];
}

export const QUESTIONS: readonly AnalyticsQuestion[] = [
  {
    id: 'reach_trend',
    label: 'How has reach changed over recent posts, per brand?',
    keywords: ['reach', 'drop', 'dropped', 'trend', 'views', 'seen', 'audience', 'impressions'],
  },
  {
    id: 'top_hook_patterns',
    label: 'Which hook shapes and angles perform best?',
    keywords: ['hook', 'angle', 'style', 'creative', 'working', 'best', 'perform', 'pattern'],
  },
  {
    id: 'failed_posts',
    label: 'Which posts failed to publish, and why?',
    keywords: ['failed', 'failure', 'error', 'not published', 'publish', 'broken', 'why'],
  },
  {
    id: 'ad_spend',
    label: 'What has been spent on ads, and what did it return?',
    keywords: ['spend', 'spent', 'cost', 'budget', 'ads', 'cpc', 'money'],
  },
  {
    id: 'pain_points',
    label: 'What does the audience complain about?',
    keywords: ['pain', 'complain', 'complaint', 'frustration', 'customers', 'audience', 'want'],
  },
  {
    id: 'posting_cadence',
    label: 'How often has each brand posted, and when is the next run?',
    keywords: ['often', 'cadence', 'schedule', 'next', 'posting', 'frequency', 'when'],
  },
];

function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Highest keyword overlap wins; zero overlap returns null.
export function matchQuestion(query: string): AnalyticsQuestion | null {
  const text = normalise(query ?? '');
  if (!text) return null;

  let best: { question: AnalyticsQuestion; score: number } | null = null;
  for (const question of QUESTIONS) {
    // Multi-word keywords ("not published") must match as a phrase.
    const score = question.keywords.reduce(
      (sum, keyword) => (text.includes(normalise(keyword)) ? sum + 1 : sum),
      0,
    );
    if (score > 0 && (!best || score > best.score)) best = { question, score };
  }
  return best?.question ?? null;
}

// Safe to send to a client: no query internals.
export function listQuestions(): Array<{ id: string; label: string }> {
  return QUESTIONS.map(({ id, label }) => ({ id, label }));
}
