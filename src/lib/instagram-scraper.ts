import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { cleanIgCaption } from './ig-caption-clean';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScrapedPost {
  shortcode: string;
  caption: string;
  likes: number;
  comments: number;
  timestamp: string;
  imageUrl: string;
  isVideo: boolean;
  brand: 'affectly' | 'pacebrain';
  /** Hashtags extracted from caption */
  hashtags: string[];
  /** Caption length in characters */
  captionLength: number;
  /** Day of week posted (e.g. "Monday") */
  dayOfWeek: string;
  /** Hour posted (0-23) */
  hourPosted: number;
  /** Whether this is from a competitor account */
  isCompetitor: boolean;
  /** Instagram handle this was scraped from */
  accountHandle: string;
}

export interface ScrapeResult {
  posts: ScrapedPost[];
  scrapedAt: string;
  accounts: string[];
  errors: string[];
}

export interface CompetitorScrapeResult {
  posts: ScrapedPost[];
  scrapedAt: string;
  accounts: string[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

const DATA_PATH = path.join(process.cwd(), 'src', 'data', 'scraped-posts.json');
const COMPETITOR_DATA_PATH = path.join(process.cwd(), 'src', 'data', 'scraped-competitors.json');

export function loadScrapedData(): ScrapeResult | null {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf-8');
    return JSON.parse(raw) as ScrapeResult;
  } catch {
    return null;
  }
}

export function saveScrapedData(data: ScrapeResult): void {
  try {
    const dir = path.dirname(DATA_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save scraped data:', err);
  }
}

export function loadCompetitorData(): CompetitorScrapeResult | null {
  try {
    const raw = fs.readFileSync(COMPETITOR_DATA_PATH, 'utf-8');
    return JSON.parse(raw) as CompetitorScrapeResult;
  } catch {
    return null;
  }
}

export function saveCompetitorData(data: CompetitorScrapeResult): void {
  try {
    const dir = path.dirname(COMPETITOR_DATA_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(COMPETITOR_DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save competitor data:', err);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OWN_ACCOUNTS: { handle: string; brand: 'affectly' | 'pacebrain' }[] = [
  { handle: 'affectly.app', brand: 'affectly' },
  { handle: 'pacebrain.app', brand: 'pacebrain' },
];

const COMPETITOR_ACCOUNTS: { handle: string; brand: 'affectly' | 'pacebrain' }[] = [
  // Affectly competitors (wellness / mental health)
  { handle: 'calm', brand: 'affectly' },
  { handle: 'headspace', brand: 'affectly' },
  { handle: 'wysa_buddy', brand: 'affectly' },
  { handle: 'nedratawwab', brand: 'affectly' },
  // PaceBrain competitors (running / fitness)
  { handle: 'strava', brand: 'pacebrain' },
  { handle: 'nikerunning', brand: 'pacebrain' },
  { handle: 'garmin', brand: 'pacebrain' },
  { handle: 'corosexplore', brand: 'pacebrain' },
];

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function extractPostMetadata(caption: string, timestamp: string) {
  const hashtags = (caption.match(/#\w+/g) || []).map((t) => t.toLowerCase());
  const captionLength = caption.length;
  const date = timestamp ? new Date(timestamp) : new Date();
  const dayOfWeek = DAYS_OF_WEEK[date.getDay()];
  const hourPosted = date.getHours();
  return { hashtags, captionLength, dayOfWeek, hourPosted };
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function parseOgDescription(content: string): { likes: number; comments: number; caption: string } {
  // Typical format: "X likes, Y comments - CAPTION" or "X Likes, Y Comments - CAPTION"
  let likes = 0;
  let comments = 0;
  let caption = content;

  const likesMatch = content.match(/([\d,]+)\s*likes?/i);
  if (likesMatch) {
    likes = parseInt(likesMatch[1].replace(/,/g, ''), 10) || 0;
  }

  const commentsMatch = content.match(/([\d,]+)\s*comments?/i);
  if (commentsMatch) {
    comments = parseInt(commentsMatch[1].replace(/,/g, ''), 10) || 0;
  }

  // Caption is usually after the dash
  const dashIdx = content.indexOf(' - ');
  if (dashIdx !== -1) {
    caption = content.slice(dashIdx + 3).trim();
  }

  return { likes, comments, caption: cleanIgCaption(caption) };
}

// ---------------------------------------------------------------------------
// Core scraper (reusable for own + competitor accounts)
// ---------------------------------------------------------------------------

async function scrapeAccounts(
  accountList: { handle: string; brand: 'affectly' | 'pacebrain' }[],
  options: { isCompetitor: boolean; maxPostsPerAccount: number },
): Promise<{ posts: ScrapedPost[]; accounts: string[]; errors: string[] }> {
  const allPosts: ScrapedPost[] = [];
  const errors: string[] = [];
  const accounts: string[] = [];

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    return {
      posts: [],
      accounts: [],
      errors: [`Failed to launch browser: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  try {
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);

    for (const { handle, brand } of accountList) {
      accounts.push(handle);

      try {
        await page.goto(`https://www.instagram.com/${handle}/`, {
          waitUntil: 'domcontentloaded',
          timeout: 15_000,
        });

        await page.waitForSelector('article, main', { timeout: 15_000 }).catch(() => {});

        // Scroll to load more posts
        for (let i = 0; i < 4; i++) {
          await page.evaluate(() => window.scrollBy(0, window.innerHeight));
          await page.waitForTimeout(1_000);
        }

        // Collect post links from the grid
        const postLinks = await page.evaluate(() => {
          const anchors = document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]');
          const hrefs: string[] = [];
          const seen = new Set<string>();
          anchors.forEach((a) => {
            const href = (a as HTMLAnchorElement).href;
            if (!seen.has(href)) {
              seen.add(href);
              hrefs.push(href);
            }
          });
          return hrefs;
        });

        const linksToScrape = postLinks.slice(0, options.maxPostsPerAccount);

        for (const link of linksToScrape) {
          try {
            const shortcodeMatch = link.match(/\/(p|reel)\/([\w-]+)/);
            const shortcode = shortcodeMatch ? shortcodeMatch[2] : '';
            const isVideo = link.includes('/reel/');

            await page.goto(link, {
              waitUntil: 'domcontentloaded',
              timeout: 10_000,
            });

            let likes = 0;
            let comments = 0;
            let caption = '';
            let imageUrl = '';
            let timestamp = '';

            const ogDesc = await page
              .locator('meta[property="og:description"]')
              .getAttribute('content')
              .catch(() => null);

            if (ogDesc) {
              const parsed = parseOgDescription(ogDesc);
              likes = parsed.likes;
              comments = parsed.comments;
              caption = parsed.caption;
            }

            if (likes === 0) {
              const likesText = await page
                .locator('section span')
                .allTextContents()
                .catch(() => [] as string[]);

              for (const t of likesText) {
                const m = t.match(/([\d,]+)\s*likes?/i);
                if (m) {
                  likes = parseInt(m[1].replace(/,/g, ''), 10) || 0;
                  break;
                }
              }
            }

            const ogImage = await page
              .locator('meta[property="og:image"]')
              .getAttribute('content')
              .catch(() => null);
            if (ogImage) imageUrl = ogImage;

            const timeEl = await page
              .locator('time[datetime]')
              .first()
              .getAttribute('datetime')
              .catch(() => null);
            if (timeEl) timestamp = timeEl;

            if (!caption) {
              const captionEl = await page
                .locator('h1, div[role="presentation"] span')
                .first()
                .textContent()
                .catch(() => null);
              if (captionEl) caption = cleanIgCaption(captionEl);
            }

            const meta = extractPostMetadata(caption, timestamp);

            allPosts.push({
              shortcode,
              caption,
              likes,
              comments,
              timestamp,
              imageUrl,
              isVideo,
              brand,
              hashtags: meta.hashtags,
              captionLength: meta.captionLength,
              dayOfWeek: meta.dayOfWeek,
              hourPosted: meta.hourPosted,
              isCompetitor: options.isCompetitor,
              accountHandle: handle,
            });
          } catch (postErr) {
            errors.push(
              `Failed to scrape post ${link}: ${postErr instanceof Error ? postErr.message : String(postErr)}`,
            );
          }

          await page.waitForTimeout(1_500);
        }
      } catch (accountErr) {
        errors.push(
          `Failed to scrape @${handle}: ${accountErr instanceof Error ? accountErr.message : String(accountErr)}`,
        );
      }
    }

    await browser.close();
  } catch (globalErr) {
    errors.push(
      `Browser error: ${globalErr instanceof Error ? globalErr.message : String(globalErr)}`,
    );
    await browser.close().catch(() => {});
  }

  return { posts: allPosts, accounts, errors };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function scrapeInstagramAccounts(): Promise<ScrapeResult> {
  const result = await scrapeAccounts(OWN_ACCOUNTS, {
    isCompetitor: false,
    maxPostsPerAccount: 20,
  });
  return { ...result, scrapedAt: new Date().toISOString() };
}

export async function scrapeCompetitorAccounts(): Promise<CompetitorScrapeResult> {
  const result = await scrapeAccounts(COMPETITOR_ACCOUNTS, {
    isCompetitor: true,
    maxPostsPerAccount: 12,
  });
  return { ...result, scrapedAt: new Date().toISOString() };
}
