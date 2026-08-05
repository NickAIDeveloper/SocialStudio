import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppSidebar } from '../app-sidebar';

vi.mock('next/navigation', () => ({
  usePathname: () => '/analyze',
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { name: 'Tess', email: 't@example.com' } } }),
  signOut: vi.fn(),
}));

describe('AppSidebar', () => {
  // Asserting on hrefs rather than link text: group headings sit in the same
  // tree, so a text query cannot tell a heading from a link.
  const hrefs = () =>
    screen.getAllByRole('link').map((a) => a.getAttribute('href'));

  it('links to every primary destination plus Settings', () => {
    render(<AppSidebar />);
    for (const href of [
      '/create', '/smart-posts', '/autopilot',
      '/ads', '/ads/queue', '/ads/genome',
      '/analyze', '/intel', '/ask', '/research',
      '/settings',
    ]) {
      expect(hrefs(), href).toContain(href);
    }
  });

  it('groups the nav under marketer-facing headings', () => {
    render(<AppSidebar />);
    for (const title of ['Make posts', 'Automate', 'Advertising', 'Insights', 'Account']) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it('does not light up the Ads parent while a child route is open', () => {
    render(<AppSidebar />);
    // usePathname is mocked to /analyze, so nothing under /ads is active.
    const ads = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '/ads');
    expect(ads?.getAttribute('data-active')).toBe('false');
    // Two links point at /analyze: the logo (no data-active) and the nav item.
    const analyze = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href') === '/analyze' && a.hasAttribute('data-active'));
    expect(analyze).toHaveLength(1);
    expect(analyze[0].getAttribute('data-active')).toBe('true');
  });

  it('renders the user menu trigger from the footer', () => {
    render(<AppSidebar />);
    // UserMenu shows the user's display name/email as the trigger label.
    expect(screen.getByText('Tess')).toBeInTheDocument();
  });
});
