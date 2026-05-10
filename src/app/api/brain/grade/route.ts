// src/app/api/brain/grade/route.ts
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { brands } from '@/lib/db/schema';
import { readBrandBrain } from '@/lib/brain/consume';
import { runGrade } from '@/lib/brain/grade';
import { cerebrasChatCompletion } from '@/lib/cerebras';

export const dynamic = 'force-dynamic';

interface Body {
  caption: string;
  hookText: string;
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get('brandId');
  if (!brandId) return NextResponse.json({ error: 'missing_brandId' }, { status: 400 });

  const [brand] = await db
    .select()
    .from(brands)
    .where(and(eq(brands.id, brandId), eq(brands.userId, session.user.id)));
  if (!brand) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const caption = typeof body.caption === 'string' ? body.caption.slice(0, 4000) : '';
  const hookText = typeof body.hookText === 'string' ? body.hookText.slice(0, 200) : '';
  if (!caption && !hookText) {
    return NextResponse.json({ error: 'empty_draft' }, { status: 400 });
  }

  const brain = await readBrandBrain(brandId);

  const report = await runGrade(
    { brain, draft: { caption, hookText } },
    {
      llmCall: async (system, user) =>
        cerebrasChatCompletion(
          [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          { temperature: 0.4, maxTokens: 600, responseFormat: 'json' }
        ),
    }
  );

  return NextResponse.json({ ...report, brainAvailable: brain !== null });
}
