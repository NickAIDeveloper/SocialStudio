import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth-helpers';
import { createInstagramImageWithText } from '@/lib/image-processing';

// Allow extra headroom — sharp + remote image fetch can be slow.
export const maxDuration = 30;

const VALID_BRANDS = ['affectly', 'pacebrain'] as const;
type Brand = (typeof VALID_BRANDS)[number];
const VALID_POSITIONS = ['top', 'center', 'bottom'] as const;
type TextPosition = (typeof VALID_POSITIONS)[number];
const VALID_STYLES = ['editorial', 'bold-card', 'gradient-bar', 'full-tint'] as const;
type OverlayStyle = (typeof VALID_STYLES)[number];

interface RenderBody {
  sourceImageUrl?: string;
  hookText?: string;
  brand?: string;
  textPosition?: string;
  overlayStyle?: string;
  logoUrl?: string | null;
}

function isOneOf<T extends string>(allowed: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v);
}

export async function POST(req: NextRequest) {
  try {
    await getUserId();

    const body = (await req.json().catch(() => ({}))) as RenderBody;

    if (!body.sourceImageUrl || typeof body.sourceImageUrl !== 'string') {
      return NextResponse.json(
        { error: 'sourceImageUrl_required', message: 'sourceImageUrl is required.' },
        { status: 400 },
      );
    }
    if (!isOneOf<Brand>(VALID_BRANDS, body.brand)) {
      return NextResponse.json(
        { error: 'invalid_brand', message: `brand must be one of ${VALID_BRANDS.join(', ')}.` },
        { status: 400 },
      );
    }
    if (!isOneOf<TextPosition>(VALID_POSITIONS, body.textPosition)) {
      return NextResponse.json(
        { error: 'invalid_text_position', message: `textPosition must be one of ${VALID_POSITIONS.join(', ')}.` },
        { status: 400 },
      );
    }
    if (!isOneOf<OverlayStyle>(VALID_STYLES, body.overlayStyle)) {
      return NextResponse.json(
        { error: 'invalid_overlay_style', message: `overlayStyle must be one of ${VALID_STYLES.join(', ')}.` },
        { status: 400 },
      );
    }

    const hookText = (body.hookText ?? '').slice(0, 60);
    const logoUrl = typeof body.logoUrl === 'string' ? body.logoUrl : null;

    try {
      const buf = await createInstagramImageWithText(
        body.sourceImageUrl,
        body.brand,
        hookText,
        body.textPosition,
        '#FFFFFF',
        64,
        body.overlayStyle,
        logoUrl,
      );
      return NextResponse.json({ imageDataUrl: `data:image/jpeg;base64,${buf.toString('base64')}` });
    } catch (err) {
      console.error('[SmartPosts/render] overlay failed:', err);
      return NextResponse.json(
        { error: 'render_failed', message: err instanceof Error ? err.message : 'Render failed.' },
        { status: 502 },
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[SmartPosts/render] Error:', error);
    return NextResponse.json(
      { error: 'unknown', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
