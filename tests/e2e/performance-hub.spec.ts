import { test, expect, type Page, type Route } from 'playwright/test';

// Performance hub + Smart Posts E2E smoke. Covers the 7 steps from
// PLAN-performance-hub.md section 12.
//
// External services (Cerebras, Meta) are intercepted with page.route() so
// this suite never depends on live LLM or Graph API responses. The test
// user must exist in the database and have at least one Instagram account
// connected; see tests/e2e/README.md for setup.

const E2E_EMAIL = process.env.E2E_USER_EMAIL;
const E2E_PASSWORD = process.env.E2E_USER_PASSWORD;
const haveCreds = Boolean(E2E_EMAIL && E2E_PASSWORD);

// Skip the whole file cleanly when creds are absent. A local dev without
// a seeded account gets a pass, not a crash.
test.skip(!haveCreds, 'E2E_USER_EMAIL / E2E_USER_PASSWORD not set');

// Canned god-mode response. Shape matches what smart-posts-dashboard renders:
// PerfectPost with godModeRationale + deepProfile + contributions.
const GOD_MODE_RATIONALE =
  'Carousels reach 2.3x your overall median so we built one. Monday 19:00 is your top slot by engagement. Saves lead reach on your best posts, so the hook asks a question. Hashtags mirror the topics that outperform on your account.';

const CANNED_GOD_MODE_RESPONSE = {
  imageDataUrl:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  sourceImageUrl: 'https://example.com/source.jpg',
  caption: 'Your question-hook caption here',
  hashtags: '#brand #growth',
  hookText: 'Ever wonder why most posts stall?',
  suggestedPostTime: { day: 'Monday', hour: 19 },
  scheduledAt: null,
  contributions: {},
  godModeRationale: GOD_MODE_RATIONALE,
  deepProfile: {
    igUserId: 'ig_test_1',
    handle: 'testaccount',
    followerCount: 1000,
    sampleSize: 30,
    medians: { reach: 500, views: null, likes: 40, comments: 5, saves: 10, shares: 3 },
    formatPerformance: [
      { format: 'CAROUSEL', count: 10, medianReach: 1150, medianSaves: 25, medianShares: 8, liftVsOverall: 2.3 },
      { format: 'REEL', count: 15, medianReach: 600, medianSaves: 12, medianShares: 4, liftVsOverall: 1.2 },
      { format: 'IMAGE', count: 5, medianReach: 300, medianSaves: 6, medianShares: 1, liftVsOverall: 0.6 },
    ],
    hookPatterns: [],
    captionLengthSweetSpot: { shortMedian: 400, mediumMedian: 600, longMedian: 550, winner: 'medium' },
    timing: {
      heatmap: Array.from({ length: 7 }, () => Array(24).fill(null)),
      bestSlots: [{ day: 'Monday', hour: 19, medianReach: 2000 }],
    },
    topicSignals: { winning: ['growth'], losing: ['giveaway'] },
  },
};

const GENERATE_CONTRIBUTION =
  'Carousels averaged 2.3x your overall reach over the last 30 posts, so we built a carousel this time.';

const CANNED_GENERATE_RESPONSE = {
  imageDataUrl:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  sourceImageUrl: 'https://example.com/source.jpg',
  caption: 'Scrape-path caption',
  hashtags: '#brand',
  hookText: 'A scraped hook',
  contributions: { format: GENERATE_CONTRIBUTION },
};

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(E2E_EMAIL!);
  await page.getByLabel('Password').fill(E2E_PASSWORD!);
  await page.getByRole('button', { name: /sign in/i }).click();
  // Successful login lands on /home.
  await page.waitForURL(/\/home(\?|$)/, { timeout: 15_000 });
}

test.describe('Performance hub + Smart Posts smoke', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('analytics page renders with source toggle', async ({ page }) => {
    await page.goto('/analytics');
    // Top-level page heading is stable.
    await expect(page.getByRole('heading', { name: 'Analytics', level: 1 })).toBeVisible();
    // Source toggle is visible with both options labelled verbatim.
    await expect(page.getByText('Meta insights', { exact: true })).toBeVisible();
    await expect(page.getByText('Scrape', { exact: true })).toBeVisible();
  });

  test('analytics source toggle swaps content', async ({ page }) => {
    await page.goto('/analytics?source=scrape');
    // Scrape branch renders AnalyticsDashboard, not the Meta "Pick an
    // Instagram account above" helper text.
    await expect(
      page.getByText(/Pick an Instagram account above/i),
    ).toHaveCount(0);

    // Toggle to Meta. The pill button is labelled exactly "Meta insights".
    await page.getByRole('button', { name: 'Meta insights', exact: true }).click();
    await expect(page).toHaveURL(/source=meta/);
  });

  test('smart-posts god-mode: button label + WhyThisWorks rationale', async ({ page }) => {
    await page.route('**/api/smart-posts/god-mode', async (route: Route) => {
      const request = route.request();
      const body = request.postDataJSON() as { brandId?: string; igUserId?: string };
      expect(body.brandId).toBeTruthy();
      expect(body.igUserId).toBeTruthy();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(CANNED_GOD_MODE_RESPONSE),
      });
    });

    await page.goto('/smart-posts?source=meta');

    // IG picker is visible in meta mode. Pick the first real account option
    // (the first option is the "All accounts" placeholder).
    const igPicker = page.getByLabel('IG account');
    await expect(igPicker).toBeVisible();
    const options = igPicker.locator('option');
    const optionCount = await options.count();
    test.skip(optionCount < 2, 'Test account has no IG accounts connected');
    const firstRealValue = await options.nth(1).getAttribute('value');
    await igPicker.selectOption(firstRealValue!);

    // Button label mentions "god-mode post for @<handle>". We don't know the
    // exact handle for the seeded account, so match the prefix.
    const godModeButton = page.getByRole('button', {
      name: /^Generate god-mode post for @/,
    });
    await expect(godModeButton).toBeVisible();

    await godModeButton.click();

    // WhyThisWorks panel picks up the rationale. Split on the first sentence
    // so we don't depend on whitespace collapsing inside the bullet list.
    await expect(
      page.getByText(/Carousels reach 2\.3x your overall median so we built one/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('smart-posts scrape: button label + WhyThisWorks contribution', async ({ page }) => {
    await page.route('**/api/smart-posts/generate', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(CANNED_GENERATE_RESPONSE),
      });
    });

    await page.goto('/smart-posts?source=scrape');

    // In scrape mode the IG picker is hidden.
    await expect(page.getByLabel('IG account')).toHaveCount(0);

    const scrapeButton = page.getByRole('button', {
      name: /^Generate Perfect Post$/,
    });
    // Button is visible when the brand has actionable insights. Skip if the
    // seeded account has no insights to work with (tested separately in unit
    // tests).
    if ((await scrapeButton.count()) === 0) {
      test.skip(true, 'Test account has no actionable scrape insights');
      return;
    }
    await expect(scrapeButton).toBeVisible();
    await scrapeButton.click();

    await expect(
      page.getByText(/Carousels averaged 2\.3x your overall reach/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('/meta redirects to /analytics preserving query params', async ({ page }) => {
    await page.goto('/meta?connected=1');
    await page.waitForURL(/\/analytics\?.*source=meta/, { timeout: 10_000 });
    const url = new URL(page.url());
    expect(url.pathname).toBe('/analytics');
    expect(url.searchParams.get('source')).toBe('meta');
    expect(url.searchParams.get('connected')).toBe('1');
  });
});
