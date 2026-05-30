'use client';

import { useState } from 'react';
import { Search, Loader2, Heart, MessageCircle, Sparkles, ExternalLink } from 'lucide-react';

interface AnalysisResult {
  likes: number;
  comments: number;
  caption: string;
  imageUrl: string;
  analysis: string;
}

export function PostAnalyzer() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/analyze-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error ?? data.message ?? 'Analysis failed');
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze post');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-(--line) bg-(--surface) p-5 space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10">
          <Sparkles className="h-4 w-4 text-purple-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-(--txt) uppercase tracking-wider">
            Post Analyzer
          </h3>
          <p className="text-xs text-(--muted)">
            Paste an Instagram post URL to get AI-powered analysis
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleAnalyze(); }}
          placeholder="https://instagram.com/p/ABC123/"
          disabled={loading}
          className="flex-1 rounded-lg border border-(--line) bg-(--surface-2) px-4 py-2.5 text-sm text-(--txt) placeholder:text-(--muted-2) focus:outline-none focus:ring-2 focus:ring-(--violet) disabled:opacity-50"
        />
        <button
          onClick={() => void handleAnalyze()}
          disabled={loading || !url.trim()}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {loading ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Post preview */}
          <div className="flex flex-col md:flex-row gap-4 rounded-2xl border border-(--line) bg-(--surface-2) p-4">
            {result.imageUrl && (
              <div className="w-full md:w-48 h-48 flex-shrink-0 rounded-lg overflow-hidden bg-(--surface-2)">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={result.imageUrl}
                  alt="Instagram post"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-(--txt)">
                  <Heart className="h-4 w-4 text-red-400" />
                  <span className="text-sm font-medium">{result.likes.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1.5 text-(--txt)">
                  <MessageCircle className="h-4 w-4 text-(--violet-bright)" />
                  <span className="text-sm font-medium">{result.comments.toLocaleString()}</span>
                </div>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto flex items-center gap-1 text-xs text-(--violet-bright) hover:text-(--violet)"
                >
                  <ExternalLink className="h-3 w-3" />
                  View Post
                </a>
              </div>
              {result.caption && (
                <p className="text-sm text-(--muted) leading-relaxed line-clamp-4">
                  {result.caption}
                </p>
              )}
            </div>
          </div>

          {/* AI Analysis */}
          <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-400" />
              <h4 className="text-sm font-semibold text-(--txt)">AI Analysis</h4>
            </div>
            <div className="text-sm text-(--muted) leading-relaxed whitespace-pre-line">
              {result.analysis}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
