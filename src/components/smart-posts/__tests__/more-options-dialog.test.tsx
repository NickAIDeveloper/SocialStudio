import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MoreOptionsDialog } from '../more-options-dialog';
import type { RenderParams } from '@/lib/smart-posts/generate';
import type { ImageResult } from '@/lib/image-sources';

// Mock the selector so the test owns the onImagesLoaded callback and doesn't
// need to drive the real search UI.
vi.mock('@/components/image-source-selector', () => ({
  ImageSourceSelector: ({
    onImagesLoaded,
  }: {
    onImagesLoaded: (imgs: ImageResult[]) => void;
  }) => (
    <button
      type="button"
      data-testid="load-images"
      onClick={() =>
        onImagesLoaded([
          {
            id: 'img-1',
            previewURL: 'https://preview.example/1.jpg',
            largeImageURL: 'https://cdn.pixabay.com/1.jpg',
            tags: 'cat',
            source: 'pixabay',
          },
        ])
      }
    >
      load images
    </button>
  ),
}));

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

describe('<MoreOptionsDialog>', () => {
  it('on success: calls onImageChange with new data URL and closes dialog', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ imageDataUrl: 'data:image/jpeg;base64,NEW' }),
      }),
    );
    const onImageChange = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <MoreOptionsDialog
        open={true}
        onOpenChange={onOpenChange}
        renderParams={renderParams}
        onImageChange={onImageChange}
      />,
    );

    // Populate the image grid via the mocked selector, then click a thumb.
    fireEvent.click(screen.getByTestId('load-images'));
    await waitFor(() => expect(screen.getAllByRole('button').length).toBeGreaterThan(1));
    const thumbs = screen.getAllByRole('button').filter((b) => b.querySelector('img'));
    fireEvent.click(thumbs[0]);

    await waitFor(() =>
      expect(onImageChange).toHaveBeenCalledWith(
        'data:image/jpeg;base64,NEW',
        'https://cdn.pixabay.com/1.jpg',
      ),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('on failure: shows error message, does not call onImageChange or close', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) }),
    );
    const onImageChange = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <MoreOptionsDialog
        open={true}
        onOpenChange={onOpenChange}
        renderParams={renderParams}
        onImageChange={onImageChange}
      />,
    );

    fireEvent.click(screen.getByTestId('load-images'));
    await waitFor(() => expect(screen.getAllByRole('button').length).toBeGreaterThan(1));
    const thumbs = screen.getAllByRole('button').filter((b) => b.querySelector('img'));
    fireEvent.click(thumbs[0]);

    await waitFor(() =>
      expect(screen.getByText(/couldn.?t swap image/i)).toBeInTheDocument(),
    );
    expect(onImageChange).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('on missing imageDataUrl in successful response: shows error, does not swap', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );
    const onImageChange = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <MoreOptionsDialog
        open={true}
        onOpenChange={onOpenChange}
        renderParams={renderParams}
        onImageChange={onImageChange}
      />,
    );

    fireEvent.click(screen.getByTestId('load-images'));
    await waitFor(() => expect(screen.getAllByRole('button').length).toBeGreaterThan(1));
    const thumbs = screen.getAllByRole('button').filter((b) => b.querySelector('img'));
    fireEvent.click(thumbs[0]);

    await waitFor(() =>
      expect(screen.getByText(/couldn.?t swap image/i)).toBeInTheDocument(),
    );
    expect(onImageChange).not.toHaveBeenCalled();
  });
});
