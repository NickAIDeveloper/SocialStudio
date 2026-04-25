import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth-helpers';
import { cerebrasChatCompletion, isCerebrasAvailable } from '@/lib/cerebras';

// llama-3.1-8b sometimes ignores "reply as JSON" and produces prose. Even
// with response_format: json_object we get the occasional malformed payload.
// One retry with a stricter, JSON-mode system prompt rescues most failures
// without doubling the user-facing latency in the happy path.
async function chatJsonWithRetry(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options: { temperature: number; maxTokens: number },
): Promise<{ raw: string; parsed: ParseResult }> {
  const first = await cerebrasChatCompletion(messages, { ...options, responseFormat: 'json' });
  const parsed1 = parseLlmJson(first);
  if (parsed1.ok) return { raw: first, parsed: parsed1 };

  const stricter = [
    {
      role: 'system' as const,
      content:
        'You MUST reply with a single JSON object and nothing else. No markdown fences. No commentary. No preamble. The reply must start with { and end with }.',
    },
    ...messages.filter((m) => m.role !== 'system'),
  ];
  const second = await cerebrasChatCompletion(stricter, {
    ...options,
    responseFormat: 'json',
    temperature: 0,
  });
  return { raw: second, parsed: parseLlmJson(second) };
}

// POST /api/meta/instagram/analyze
//
// Thin AI analysis endpoint that the /meta UI calls after it already has the
// insights bundle in memory. The client sends a minimal post subset so we
// don't re-fetch from Meta. Supports three modes:
//   - "hero"     — top-post verdict + "make more like this" guidance
//   - "patterns" — caption pattern mining across the user's top-10 posts
//   - "autopsy"  — per-post deep dive (positive OR negative)

export const maxDuration = 30;

interface PostSummary {
  id: string;
  caption?: string;
  mediaType: string;
  format: 'REEL' | 'CAROUSEL' | 'IMAGE';
  timestamp?: string;
  reach: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
}

interface AnalyzeBody {
  mode: 'hero' | 'patterns' | 'autopsy';
  posts: PostSummary[];
  medians: {
    reach: number | null;
    views: number | null;
    likes: number | null;
    comments: number | null;
    saves: number | null;
    shares: number | null;
  };
  // For autopsy mode — which post to analyze.
  postId?: string;
}

function describePost(p: PostSummary): string {
  const parts = [
    `[${p.format}]`,
    p.caption ? `"${p.caption.slice(0, 140).replace(/\s+/g, ' ')}"` : '(no caption)',
    `reach=${p.reach ?? '—'}`,
    `saves=${p.saves ?? '—'}`,
    `likes=${p.likes ?? '—'}`,
    `comments=${p.comments ?? '—'}`,
    `shares=${p.shares ?? '—'}`,
  ];
  return parts.join(' · ');
}

function ratioLabel(v: number | null, m: number | null): string {
  if (v == null || m == null || m === 0) return 'n/a';
  const r = v / m;
  return `${r.toFixed(1)}× median`;
}

export async function POST(req: NextRequest) {
  try {
    await getUserId();
    if (!isCerebrasAvailable()) {
      return NextResponse.json({ error: 'AI not configured (CEREBRAS env var missing)' }, { status: 503 });
    }
    const body = (await req.json()) as AnalyzeBody;
    const { mode, posts, medians, postId } = body;
    if (!posts || posts.length === 0) {
      return NextResponse.json({ error: 'No posts to analyze' }, { status: 400 });
    }

    if (mode === 'hero') {
      // Pick the top post by reach (fall back to saves if reach is uniformly 0).
      const sorted = [...posts].sort(
        (a, b) => (b.reach ?? b.saves ?? 0) - (a.reach ?? a.saves ?? 0),
      );
      const top = sorted[0];
      const { raw, parsed } = await chatJsonWithRetry(
        [
          {
            role: 'system',
            content:
              'You are a social media analyst. Explain in 1-2 sentences WHY a specific Instagram post outperformed the creator\'s other posts. Be concrete — cite the hook, format, or topic. Then give ONE tactical suggestion for the next post. Reply with a single JSON object and nothing else: {"verdict": "...", "suggestion": "...", "makeMorePrompt": "short phrase to seed a new post"}.',
          },
          {
            role: 'user',
            content: `TOP POST vs creator's median:
${describePost(top)}
reach is ${ratioLabel(top.reach, medians.reach)}, saves ${ratioLabel(top.saves, medians.saves)}, shares ${ratioLabel(top.shares, medians.shares)}.

Other recent posts for context:
${sorted.slice(1, 5).map(describePost).join('\n')}

Return JSON only.`,
          },
        ],
        { temperature: 0.4, maxTokens: 500 },
      );
      if (!parsed.ok) return llmParseErrorResponse('hero', raw);
      return NextResponse.json({ data: { top, analysis: parsed.data } });
    }

    if (mode === 'patterns') {
      const sorted = [...posts]
        .sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0))
        .slice(0, 10);
      const { raw, parsed } = await chatJsonWithRetry(
        [
          {
            role: 'system',
            content:
              'You analyze Instagram caption patterns. Given a list of top posts, extract 3 concrete patterns that recur in the highest-performing ones. Focus on HOOKS, CAPTION STRUCTURE, and TOPICS. Reply with a single JSON object and nothing else: {"patterns": [{"label": "...", "evidence": "...", "howToUse": "..."}]}. Always return exactly 3 entries even if some are weak.',
          },
          {
            role: 'user',
            content: `Top posts by reach:
${sorted.map(describePost).join('\n')}

Find 3 patterns that explain the wins. Return JSON only.`,
          },
        ],
        { temperature: 0.4, maxTokens: 900 },
      );
      if (!parsed.ok) return llmParseErrorResponse('patterns', raw);
      return NextResponse.json({ data: { patterns: parsed.data } });
    }

    if (mode === 'autopsy') {
      const target = posts.find((p) => p.id === postId);
      if (!target) return NextResponse.json({ error: 'postId not found in posts[]' }, { status: 400 });
      const { raw, parsed } = await chatJsonWithRetry(
        [
          {
            role: 'system',
            content:
              'You are a social media post autopsy specialist. Given ONE post + the creator\'s medians, explain what worked or didn\'t and give 3 specific fixes/amplifications for a remake. Reply with a single JSON object and nothing else: {"verdict": "positive|negative|mixed", "why": "one paragraph", "fixes": ["...", "...", "..."]}.',
          },
          {
            role: 'user',
            content: `POST:
${describePost(target)}
reach: ${ratioLabel(target.reach, medians.reach)}
saves: ${ratioLabel(target.saves, medians.saves)}
shares: ${ratioLabel(target.shares, medians.shares)}
comments: ${ratioLabel(target.comments, medians.comments)}

Return JSON only.`,
          },
        ],
        { temperature: 0.3, maxTokens: 600 },
      );
      if (!parsed.ok) return llmParseErrorResponse('autopsy', raw);
      return NextResponse.json({ data: { postId: target.id, analysis: parsed.data } });
    }

    return NextResponse.json({ error: `Unknown mode: ${mode}` }, { status: 400 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : 'Analysis failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type ParseResult = { ok: true; data: unknown } | { ok: false; raw: string };

function stripMarkdownFences(s: string): string {
  const fenced = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  return fenced ? fenced[1].trim() : s;
}

// Walk the string tracking string/escape state so braces inside JSON string
// literals don't confuse depth tracking. Returns the first balanced object.
function extractFirstJsonObject(s: string): string | null {
  const start = s.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\') {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

// Cerebras sometimes wraps JSON in ```json blocks or adds trailing commentary
// (which may itself contain braces and break a naive lastIndexOf('}') pass).
// Try: clean parse after fence strip, then balanced-brace extraction.
function parseLlmJson(raw: string): ParseResult {
  const stripped = stripMarkdownFences(raw.trim());
  try {
    return { ok: true, data: JSON.parse(stripped) };
  } catch {
    // fall through
  }
  const balanced = extractFirstJsonObject(stripped);
  if (balanced) {
    try {
      return { ok: true, data: JSON.parse(balanced) };
    } catch {
      // fall through
    }
  }
  return { ok: false, raw };
}

function llmParseErrorResponse(mode: string, raw: string) {
  console.error(
    `[Analyze/${mode}] LLM returned non-JSON output (first 500 chars):`,
    raw.slice(0, 500),
  );
  return NextResponse.json(
    {
      error: 'ai_parse_failed',
      message: 'AI returned an unexpected response. Please try again.',
    },
    { status: 502 },
  );
}
