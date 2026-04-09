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
    <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/60 p-5 space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/10">
          <Recycle className="h-4 w-4 text-teal-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Content Repurposer</h3>
          <p className="text-sm text-white">
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
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 disabled:opacity-50"
        />
        {brands.length > 0 && (
          <select
            value={selectedBrandSlug}
            onChange={(e) => setSelectedBrandSlug(e.target.value)}
            disabled={loading}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-teal-500/50 disabled:opacity-50"
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
          className="flex items-center gap-2 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
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
              className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-4 space-y-3 flex flex-col"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-500/20 text-xs font-bold text-teal-400">
                  {i + 1}
                </span>
                <span className="text-xs font-medium text-white uppercase tracking-wider">
                  Post {i + 1}
                </span>
              </div>

              {post.hookText && (
                <div className="flex items-start gap-2">
                  <Type className="h-3.5 w-3.5 text-purple-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm font-semibold text-purple-300">{post.hookText}</p>
                </div>
              )}

              <p className="text-sm text-white leading-relaxed line-clamp-6 flex-1">
                {post.caption}
              </p>

              {post.hashtags && (
                <div className="flex items-start gap-2">
                  <Hash className="h-3.5 w-3.5 text-teal-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-teal-300 leading-relaxed line-clamp-2">
                    {post.hashtags}
                  </p>
                </div>
              )}

              <button
                onClick={() => handleUsePost(post)}
                className="flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-500 mt-auto"
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
