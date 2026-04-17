import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth-helpers';
import { cerebrasChatCompletion, isCerebrasAvailable } from '@/lib/cerebras';

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
      return NextResponse.json({ error: 'AI not configured (CEREBUS env var missing)' }, { status: 503 });
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
      const verdictRaw = await cerebrasChatCompletion(
        [
          {
            role: 'system',
            content:
              'You are a social media analyst. Explain in 1-2 sentences WHY a specific Instagram post outperformed the creator\'s other posts. Be concrete — cite the hook, format, or topic. Then give ONE tactical suggestion for the next post. Reply as JSON: {"verdict": "...", "suggestion": "...", "makeMorePrompt": "short phrase to seed a new post"}.',
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
        { temperature: 0.4, maxTokens: 400 },
      );
      return NextResponse.json({ data: { top, analysis: safeParseJson(verdictRaw) } });
    }

    if (mode === 'patterns') {
      const sorted = [...posts]
        .sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0))
        .slice(0, 10);
      const raw = await cerebrasChatCompletion(
        [
          {
            role: 'system',
            content:
              'You analyze Instagram caption patterns. Given a list of top posts, extract 3 concrete patterns that recur in the highest-performing ones. Focus on HOOKS, CAPTION STRUCTURE, and TOPICS. Reply as JSON: {"patterns": [{"label": "...", "evidence": "...", "howToUse": "..."}]}.',
          },
          {
            role: 'user',
            content: `Top posts by reach:
${sorted.map(describePost).join('\n')}

Find 3 patterns that explain the wins. Return JSON only.`,
          },
        ],
        { temperature: 0.4, maxTokens: 600 },
      );
      return NextResponse.json({ data: { patterns: safeParseJson(raw) } });
    }

    if (mode === 'autopsy') {
      const target = posts.find((p) => p.id === postId);
      if (!target) return NextResponse.json({ error: 'postId not found in posts[]' }, { status: 400 });
      const raw = await cerebrasChatCompletion(
        [
          {
            role: 'system',
            content:
              'You are a social media post autopsy specialist. Given ONE post + the creator\'s medians, explain what worked or didn\'t and give 3 specific fixes/amplifications for a remake. Reply as JSON: {"verdict": "positive|negative|mixed", "why": "one paragraph", "fixes": ["...", "...", "..."]}.',
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
        { temperature: 0.3, maxTokens: 500 },
      );
      return NextResponse.json({ data: { postId: target.id, analysis: safeParseJson(raw) } });
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

// Cerebras sometimes wraps JSON in ```json blocks or adds trailing commentary.
// Strip non-JSON prefixes/suffixes before parsing and return null on failure
// so the client can gracefully degrade to "analysis unavailable".
function safeParseJson(raw: string): unknown {
  const trimmed = raw.trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  try {
    return JSON.parse(trimmed.slice(first, last + 1));
  } catch {
    return null;
  }
}
