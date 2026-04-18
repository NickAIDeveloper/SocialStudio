import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SetupBanner } from '../setup-banner';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

function mockFetch(brandsOk: boolean, bufferOk: boolean, imageSourceOk: boolean) {
  global.fetch = vi.fn((url: string | URL) => {
    const u = typeof url === 'string' ? url : url.toString();
    if (u.startsWith('/api/brands')) {
      return Promise.resolve(new Response(
        JSON.stringify({ brands: brandsOk ? [{ instagramHandle: 'me' }] : [{}] }),
        { status: 200 },
      ));
    }
    if (u.startsWith('/api/buffer')) {
      return Promise.resolve(new Response('{}', { status: bufferOk ? 200 : 401 }));
    }
    if (u.startsWith('/api/linked-accounts')) {
      return Promise.resolve(new Response(
        JSON.stringify({
          success: true,
          data: imageSourceOk ? [{ provider: 'pexels' }] : [],
        }),
        { status: 200 },
      ));
    }
    return Promise.resolve(new Response('{}', { status: 404 }));
  }) as typeof fetch;
}

describe('SetupBanner', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('hides when all three setup items are complete', async () => {
    mockFetch(true, true, true);
    const { container } = render(<SetupBanner />);
    await waitFor(() => {
      expect(container.textContent).not.toContain('Finish setup');
    });
  });

  it('shows missing-item chips when items are incomplete', async () => {
    mockFetch(false, false, false);
    render(<SetupBanner />);
    expect(await screen.findByText(/Add brand with Instagram handle/)).toBeInTheDocument();
    expect(screen.getByText(/Connect Buffer/)).toBeInTheDocument();
    expect(screen.getByText(/Pick an image source/)).toBeInTheDocument();
  });
});
