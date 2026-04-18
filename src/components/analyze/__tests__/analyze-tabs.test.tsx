import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnalyzeTabs, readTab } from '../analyze-tabs';

const mockReplace = vi.fn();
let mockSp = '';

vi.mock('next/navigation', () => ({
  usePathname: () => '/analyze',
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(mockSp),
}));

describe('readTab', () => {
  it('defaults to you for missing or unknown values', () => {
    expect(readTab(new URLSearchParams(''))).toBe('you');
    expect(readTab(new URLSearchParams('tab=bogus'))).toBe('you');
  });
  it('accepts valid values', () => {
    expect(readTab(new URLSearchParams('tab=competitors'))).toBe('competitors');
    expect(readTab(new URLSearchParams('tab=compare'))).toBe('compare');
  });
});

describe('AnalyzeTabs', () => {
  beforeEach(() => {
    mockSp = '';
    mockReplace.mockClear();
  });

  it('clicking Competitors pushes ?tab=competitors preserving other params', () => {
    mockSp = 'source=meta&brand=b1';
    render(<AnalyzeTabs />);
    fireEvent.click(screen.getByRole('tab', { name: /competitors/i }));
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('tab=competitors'),
      expect.any(Object),
    );
    expect(mockReplace.mock.calls[0][0]).toContain('source=meta');
    expect(mockReplace.mock.calls[0][0]).toContain('brand=b1');
  });

  it('clicking You removes the tab param', () => {
    mockSp = 'tab=compare';
    render(<AnalyzeTabs />);
    fireEvent.click(screen.getByRole('tab', { name: /you/i }));
    const target = mockReplace.mock.calls[0][0] as string;
    expect(target).not.toContain('tab=');
  });
});
