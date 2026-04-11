import { NextRequest, NextResponse } from 'next/server';
import {
  createInstagramImage,
  createInstagramImageWithText,
  processCarouselImages,
  processLogos,
} from '@/lib/image-processing';
import type { CarouselImageConfig } from '@/lib/image-processing';
import { getUserId } from '@/lib/auth-helpers';
import { db } from '@/lib/db';
import { brands } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

async function getBrandLogoUrl(brandId: string | undefined | null, userId: string): Promise<string | null> {
  if (!brandId) return null;
  const [brand] = await db
    .select({ logoUrl: brands.logoUrl })
    .from(brands)
    .where(and(eq(brands.id, brandId), eq(brands.userId, userId)))
    .limit(1);
  return brand?.logoUrl ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();

    const body = await request.json();
    const brandId: string | undefined = body.brandId;
    const logoUrl = await getBrandLogoUrl(brandId, userId);

    // Carousel mode: process multiple images
    if (Array.isArray(body.images)) {
      const configs: CarouselImageConfig[] = body.images;

      for (const config of configs) {
        if (!config.imageUrl || !config.brand) {
          return NextResponse.json(
            { error: 'Each image config requires imageUrl and brand' },
            { status: 400 }
          );
        }
      }

      const buffers = await processCarouselImages(configs, logoUrl);
      const base64Images = buffers.map((buf) => buf.toString('base64'));

      return NextResponse.json({ images: base64Images });
    }

    // Single image mode
    const { imageUrl, brand, overlayText, textPosition, textColor, fontSize, overlayStyle, imageEffect } = body;

    if (!imageUrl || !brand) {
      return NextResponse.json(
        { error: 'imageUrl and brand are required' },
        { status: 400 }
      );
    }

    // Base image processing: resize + optional effect + logo composite.
    // Hook text is rendered as a client-side CSS overlay in the preview.
    const processedImage = await createInstagramImage(imageUrl, brand, logoUrl, imageEffect || 'none');

    return new NextResponse(new Uint8Array(processedImage), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Disposition': `inline; filename="${brand}-post.jpg"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Logo processing error:', error);
    return NextResponse.json(
      { error: 'Failed to process image' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    await getUserId();

    const results = await processLogos();
    return NextResponse.json({
      message: 'Logos processed',
      results,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Logo processing error:', error);
    return NextResponse.json(
      { error: 'Failed to process logos' },
      { status: 500 }
    );
  }
}
