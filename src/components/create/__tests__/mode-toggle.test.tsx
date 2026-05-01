import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModeToggle, readMode } from '../mode-toggle';

const mockReplace = vi.fn();
let mockSp = '';

vi.mock('next/navigation', () => ({
  usePathname: () => '/create',
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(mockSp),
}));

describe('readMode', () => {
  it('defaults to single', () => {
    expect(readMode(new URLSearchParams(''))).toBe('single');
    expect(readMode(new URLSearchParams('mode=bogus'))).toBe('single');
  });
  it('accepts batch', () => {
    expect(readMode(new URLSearchParams('mode=batch'))).toBe('batch');
  });
});

describe('ModeToggle', () => {
  beforeEach(() => {
    mockSp = '';
    mockReplace.mockClear();
  });

  it('clicking Batch pushes ?mode=batch', () => {
    render(<ModeToggle />);
    fireEvent.click(screen.getByRole('tab', { name: /batch/i }));
    expect(mockReplace.mock.calls[0][0]).toContain('mode=batch');
  });

  it('clicking Single removes mode param', () => {
    mockSp = 'mode=batch&brand=b1';
    render(<ModeToggle />);
    fireEvent.click(screen.getByRole('tab', { name: /single/i }));
    const target = mockReplace.mock.calls[0][0] as string;
    expect(target).not.toContain('mode=');
    expect(target).toContain('brand=b1');
  });
});
