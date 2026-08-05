// One-off: correct Affectly's brand description and repoint its audience
// research away from the fitness community.
//
// Affectly is an emotion-adaptive AI tutor with neurodiversity supports.
//
// Its stored description was a raw scrape of the marketing site: real product
// information, but carrying headings, exclamations and em dashes straight into
// every prompt that treats it as brand truth. Replaced with a factual prose
// description that also covers the neurodiversity supports the scrape omitted.
//
// The bigger problem was the research. Its pain points were mined from Stack
// Exchange FITNESS, so autopilot was writing Instagram captions about gym
// fatigue and protein intake for a learning app. The default-guessing bug was
// fixed on 2026-08-03, but that fix only stopped NEW brands being guessed at;
// this row was already wrong and sailed straight through.
//
// Clearing `ranked` stops the wrong pains reaching generation immediately.
// Setting `source` to productivity and backdating `fetchedAt` lets the nightly
// cron re-research it through the normal shipped path.
//
// Run: npx tsx scripts/fix-affectly-brand-and-research.ts --prod
import 'dotenv/config';
import { config } from 'dotenv';
const useProd = process.argv.includes('--prod');
config({ path: useProd ? '.env.vercel-production' : '.env.local', override: true });

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { eq } from 'drizzle-orm';
import { brands, brandPainPoints } from '../src/lib/db/schema';

const DESCRIPTION = [
  'Affectly is an AI tutor that adapts to how you feel and to how your brain learns.',
  'You begin each session by saying how you feel, and the lesson shifts with it: gentler when you are stuck, deeper when you are flying.',
  'Optional supports for ADHD, autistic, AuDHD and dyslexic learners break content into smaller steps, use plain literal language, reduce visual noise, remove time pressure, and read answers aloud.',
  'You can learn any topic with the tutor, upload your own documents, take structured courses, and build flashcards.',
  'It shows you when you learn best and which feelings fuel your focus.',
  'Built on published research in affective computing, educational psychology, cognitive neuroscience and neurodiversity.',
  'It saves your learning settings, never a diagnosis or a label.',
].join(' ');

(async () => {
  const db = drizzle(neon(process.env.NEON_DB_URL!));
  console.log(`DB: ${useProd ? 'PRODUCTION' : 'dev'}`);

  const [brand] = await db.select().from(brands).where(eq(brands.slug, 'affectly'));
  if (!brand) { console.error('affectly brand not found'); process.exit(1); }

  console.log(`\nOLD description: ${brand.description ?? '(none)'}`);
  await db.update(brands).set({ description: DESCRIPTION }).where(eq(brands.id, brand.id));
  console.log(`NEW description: ${DESCRIPTION.slice(0, 100)}...`);

  const [pain] = await db.select().from(brandPainPoints).where(eq(brandPainPoints.brandId, brand.id));
  if (pain) {
    const old = (pain.ranked as Array<{ theme: string }> | null) ?? [];
    console.log(`\nOLD research: ${pain.source} -> ${old.map(p => p.theme).slice(0, 4).join(', ')}`);
    await db.update(brandPainPoints)
      .set({
        source: 'stackexchange:productivity',
        ranked: [],
        queries: [],
        discussionsScanned: 0,
        // Backdated so isPainResearchStale() is true and tonight's cron refreshes it.
        fetchedAt: new Date('2026-01-01T00:00:00Z'),
      })
      .where(eq(brandPainPoints.brandId, brand.id));
    console.log('NEW research: stackexchange:productivity, cleared, backdated for cron refresh');
  } else {
    console.log('\nno existing pain row (nothing to clear)');
  }
})();
