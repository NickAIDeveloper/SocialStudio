'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Recycle, Loader2, ArrowRight, Hash, Type } from 'lucide-react';

interface Brand {
  id: string;
  name: string;
  slug: string;
}

interface RepurposedPost {
  caption: string;
  hashtags: string;
  hookText: string;
}

export function ContentRepurposer() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrandSlug, setSelectedBrandSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [posts, setPosts] = useState<RepurposedPost[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchBrands = useCallback(async () => {
    try {
      const res = await fetch('/api/brands');
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setBrands(json.data);
        if (json.data.length > 0) {
          setSelectedBrandSlug(json.data[0].slug);
        }
      }
    } catch {
      // Silent — brands are optional context
    }
  }, []);

  useEffect(() => {
    fetchBrands();
  }, [fetchBrands]);

  const handleRepurpose = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setPosts([]);

    try {
      const res = await fetch('/api/repurpose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed, brandSlug: selectedBrandSlug }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error ?? data.message ?? 'Repurposing failed');
      }

      setPosts(data.posts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to repurpose content');
    } finally {
      setLoading(false);
    }
  };

  const handleUsePost = (post: RepurposedPost) => {
    // Dispatch custom event so PostGenerator (sibling component) can pick it up
    window.dispatchEvent(new CustomEvent('repurpose-use-post', {
      detail: { caption: post.caption, hashtags: post.hashtags || '', hookText: post.hookText || '' },
    }));
    // Scroll down to the post generator
    setTimeout(() => {
      document.querySelector('textarea')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  return (
    <div className="rounded-2xl border border-(--line) bg-(--surface) p-5 space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-(--violet-12)">
          <Recycle className="h-4 w-4 text-(--violet-bright)" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-(--txt)">Content Repurposer</h3>
          <p className="text-sm text-(--muted)">
            Paste a blog URL and generate 5 Instagram posts from it
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleRepurpose(); }}
          placeholder="https://example.com/blog/your-article"
          disabled={loading}
          className="flex-1 rounded-lg border border-(--line) bg-(--surface-2) px-4 py-2.5 text-sm text-(--txt) placeholder:text-(--muted-2) focus:outline-none focus:ring-2 focus:ring-(--violet) disabled:opacity-50"
        />
        {brands.length > 0 && (
          <select
            value={selectedBrandSlug}
            onChange={(e) => setSelectedBrandSlug(e.target.value)}
            disabled={loading}
            className="select-field"
          >
            {brands.map((b) => (
              <option key={b.id} value={b.slug}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={() => void handleRepurpose()}
          disabled={loading || !url.trim()}
          className="cta-violet flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Recycle className="h-4 w-4" />
          )}
          {loading ? 'Generating...' : 'Repurpose'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {posts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {posts.map((post, i) => (
            <div
              key={i}
              className="surface-card p-4 space-y-3 flex flex-col"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-(--violet-12) text-xs font-bold text-(--violet-bright)">
                  {i + 1}
                </span>
                <span className="text-xs font-medium text-(--txt) uppercase tracking-wider">
                  Post {i + 1}
                </span>
              </div>

              {post.hookText && (
                <div className="flex items-start gap-2">
                  <Type className="h-3.5 w-3.5 text-(--violet-bright) mt-0.5 flex-shrink-0" />
                  <p className="text-sm font-semibold text-(--violet-bright)">{post.hookText}</p>
                </div>
              )}

              <p className="text-sm text-(--muted) leading-relaxed line-clamp-6 flex-1">
                {post.caption}
              </p>

              {post.hashtags && (
                <div className="flex items-start gap-2">
                  <Hash className="h-3.5 w-3.5 text-(--violet-bright) mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-(--violet-bright) leading-relaxed line-clamp-2">
                    {post.hashtags}
                  </p>
                </div>
              )}

              <button
                onClick={() => handleUsePost(post)}
                className="cta-violet flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition mt-auto"
              >
                Use This
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
