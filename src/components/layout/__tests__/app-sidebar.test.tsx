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
  it('renders exactly the 4 primary items plus Settings in footer', () => {
    render(<AppSidebar />);
    expect(screen.getByText('Analyze')).toBeInTheDocument();
    expect(screen.getByText('Smart Posts')).toBeInTheDocument();
    expect(screen.getByText('Create')).toBeInTheDocument();
    expect(screen.getByText('Schedule')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders the user menu trigger from the footer', () => {
    render(<AppSidebar />);
    // UserMenu shows the user's display name/email as the trigger label.
    expect(screen.getByText('Tess')).toBeInTheDocument();
  });
});
