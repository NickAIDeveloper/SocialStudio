import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CandidateStrip } from '../candidate-strip';
import type { ImageCandidate, RenderParams } from '@/lib/smart-posts/generate';

const candidates: ImageCandidate[] = [
  { url: 'http://a.jpg', source: 'stock' },
  { url: 'http://b.jpg', source: 'stock' },
  { url: 'http://c.jpg', source: 'past', permalink: 'http://ig/c' },
];
const renderParams: RenderParams = {
  brand: 'affectly',
  hookText: 'Hi',
  textPosition: 'center',
  overlayStyle: 'editorial',
  logoUrl: null,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('<CandidateStrip>', () => {
  it('renders one thumb per candidate', () => {
    render(
      <CandidateStrip
        candidates={candidates}
        activeUrl="http://a.jpg"
        renderParams={renderParams}
        onImageChange={vi.fn()}
        onOpenMoreOptions={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('button', { name: /image candidate/i })).toHaveLength(3);
  });

  it('marks the active candidate visually (data-active=true)', () => {
    render(
      <CandidateStrip
        candidates={candidates}
        activeUrl="http://b.jpg"
        renderParams={renderParams}
        onImageChange={vi.fn()}
        onOpenMoreOptions={vi.fn()}
      />,
    );
    const thumbs = screen.getAllByRole('button', { name: /image candidate/i });
    expect(thumbs[0].getAttribute('data-active')).toBe('false');
    expect(thumbs[1].getAttribute('data-active')).toBe('true');
    expect(thumbs[2].getAttribute('data-active')).toBe('false');
  });

  it('clicking a non-active thumb POSTs to /render and calls onImageChange', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ imageDataUrl: 'data:image/jpeg;base64,XYZ' }),
    }));
    const onImageChange = vi.fn();
    render(
      <CandidateStrip
        candidates={candidates}
        activeUrl="http://a.jpg"
        renderParams={renderParams}
        onImageChange={onImageChange}
        onOpenMoreOptions={vi.fn()}
      />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: /image candidate/i })[1]);
    await waitFor(() => expect(onImageChange).toHaveBeenCalledWith('data:image/jpeg;base64,XYZ', 'http://b.jpg'));
  });

  it('clicking the active thumb is a no-op', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const onImageChange = vi.fn();
    render(
      <CandidateStrip
        candidates={candidates}
        activeUrl="http://a.jpg"
        renderParams={renderParams}
        onImageChange={onImageChange}
        onOpenMoreOptions={vi.fn()}
      />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: /image candidate/i })[0]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onImageChange).not.toHaveBeenCalled();
  });

  it('keeps existing image when /render fails (no onImageChange)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) }));
    const onImageChange = vi.fn();
    render(
      <CandidateStrip
        candidates={candidates}
        activeUrl="http://a.jpg"
        renderParams={renderParams}
        onImageChange={onImageChange}
        onOpenMoreOptions={vi.fn()}
      />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: /image candidate/i })[1]);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/couldn.?t swap/i);
    });
    expect(onImageChange).not.toHaveBeenCalled();
  });

  it('"More options" button calls onOpenMoreOptions', () => {
    const onOpen = vi.fn();
    render(
      <CandidateStrip
        candidates={candidates}
        activeUrl="http://a.jpg"
        renderParams={renderParams}
        onImageChange={vi.fn()}
        onOpenMoreOptions={onOpen}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /more options/i }));
    expect(onOpen).toHaveBeenCalled();
  });
});
