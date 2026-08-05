import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppSidebar } from '../app-sidebar';

const { nav } = vi.hoisted(() => ({ nav: { pathname: '/analyze' } }));

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
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

  /** The nav link for `href`, ignoring the logo link which carries no state. */
  const navItem = (href: string) =>
    screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href') === href && a.hasAttribute('data-active'))[0];

  it('marks the current route active', () => {
    nav.pathname = '/analyze';
    render(<AppSidebar />);
    expect(navItem('/analyze').getAttribute('data-active')).toBe('true');
    expect(navItem('/ads').getAttribute('data-active')).toBe('false');
  });

  it('does not light up the Ads parent while one of its children is open', () => {
    // The whole point of the `exact` flag. With a constant pathname mock this
    // assertion passed whether or not the flag was there.
    nav.pathname = '/ads/queue';
    render(<AppSidebar />);
    expect(navItem('/ads').getAttribute('data-active')).toBe('false');
    expect(navItem('/ads/queue').getAttribute('data-active')).toBe('true');
  });

  it('still lights up Ads on the Ads page itself', () => {
    nav.pathname = '/ads';
    render(<AppSidebar />);
    expect(navItem('/ads').getAttribute('data-active')).toBe('true');
  });

  it('keeps a non-exact parent active on its own sub-routes', () => {
    nav.pathname = '/analyze/deep-dive';
    render(<AppSidebar />);
    expect(navItem('/analyze').getAttribute('data-active')).toBe('true');
  });

  it('renders the user menu trigger from the footer', () => {
    render(<AppSidebar />);
    // UserMenu shows the user's display name/email as the trigger label.
    expect(screen.getByText('Tess')).toBeInTheDocument();
  });
});
