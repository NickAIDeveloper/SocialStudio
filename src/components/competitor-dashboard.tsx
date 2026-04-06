'use client';

import { useState, useEffect } from 'react';
import { competitors, optimalPostingTimes, hashtagSets, instagram2026Insights, type CompetitorData } from '@/data/competitor-insights';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

type BrandFilter = 'all' | 'affectly' | 'pacebrain';

const brandAccent = {
  affectly: {
    text: 'text-teal-400',
    border: 'border-teal-500/30',
    bg: 'bg-teal-500/10',
    stripe: 'bg-teal-500',
    label: 'Wellness',
  },
  pacebrain: {
    text: 'text-blue-400',
    border: 'border-blue-500/30',
    bg: 'bg-blue-500/10',
    stripe: 'bg-blue-500',
    label: 'Running',
  },
} as const;

function CompetitorCard({ competitor }: { competitor: CompetitorData }) {
  const [expanded, setExpanded] = useState(false);
  const accent = brandAccent[competitor.brand];

  return (
    <div
      className="group relative bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/50 rounded-xl overflow-hidden transition-all duration-200 hover:scale-[1.01] hover:border-zinc-700/70"
    >
      {/* Brand color stripe */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${accent.stripe}`} />

      <div className="pl-5 pr-4 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">{competitor.name}</h3>
            <p className="text-sm text-zinc-400">{competitor.handle} &middot; {competitor.followers}</p>
          </div>
          <Badge variant="outline" className={`${accent.border} ${accent.text}`}>
            {accent.label}
          </Badge>
        </div>
      </div>

      <div className="pl-5 pr-4 pb-4 space-y-4">
        {/* Winning Formulas - most prominent */}
        <div className={`rounded-lg ${accent.bg} p-3`}>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-2">Winning Formulas</p>
          <ul className="space-y-1.5">
            {competitor.winningFormulas.slice(0, expanded ? undefined : 3).map((formula, i) => (
              <li key={i} className="text-sm text-zinc-200 flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5 shrink-0">&#x2713;</span>
                {formula}
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-1.5">Posting Frequency</p>
            <p className="text-sm text-zinc-300">{competitor.postingFrequency}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-1.5">Best Times</p>
            <div className="flex flex-wrap gap-1">
              {competitor.bestPostingTimes.map((time) => (
                <Badge key={time} variant="secondary" className="bg-zinc-800 text-zinc-300 text-xs">
                  {time}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {expanded && (
          <>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-2">Top Content Types</p>
              <div className="space-y-2">
                {competitor.topContentTypes.map((content, i) => (
                  <div key={i} className="rounded-lg bg-zinc-800/50 p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        className={
                          content.engagementLevel === 'viral'
                            ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                            : content.engagementLevel === 'high'
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                            : 'bg-zinc-700/50 text-zinc-400 border-zinc-600/30'
                        }
                        variant="outline"
                      >
                        {content.engagementLevel}
                      </Badge>
                      <span className="text-sm font-medium text-white capitalize">{content.type}</span>
                    </div>
                    <p className="text-xs text-zinc-400">{content.description}</p>
                    <p className="text-xs text-zinc-500 mt-1">
                      <span className="text-zinc-400">Caption formula:</span> {content.captionFormula}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-1.5">Caption Style</p>
                <div className="text-xs space-y-1">
                  <p><span className="text-zinc-500">Tone:</span> <span className="text-zinc-300">{competitor.captionStyle.tone}</span></p>
                  <p><span className="text-zinc-500">Length:</span> <span className="text-zinc-300">{competitor.captionStyle.avgLength}</span></p>
                </div>
                <div className="mt-2">
                  <span className="text-xs text-zinc-500">CTAs:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {competitor.captionStyle.ctaPatterns.map((cta, i) => (
                      <Badge key={i} variant="outline" className="text-xs border-zinc-700 text-zinc-400">
                        &ldquo;{cta}&rdquo;
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-1.5">Visual Style</p>
                <div className="flex gap-2 mb-2">
                  {competitor.visualStyle.colors.map((color, i) => (
                    <div
                      key={i}
                      className="w-8 h-8 rounded-lg border border-zinc-700"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-1">
                  {competitor.visualStyle.imageryType.map((type, i) => (
                    <Badge key={i} variant="secondary" className="bg-zinc-800 text-zinc-400 text-xs">
                      {type}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className={`text-xs ${accent.text} hover:opacity-80 transition-opacity`}
        >
          {expanded ? 'Show less' : 'Show more details'}
        </button>
      </div>
    </div>
  );
}

function PostingTimesCard({ brand }: { brand: 'affectly' | 'pacebrain' }) {
  const times = optimalPostingTimes[brand];
  const tags = hashtagSets[brand];
  const accent = brandAccent[brand];

  return (
    <div className={`bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/50 rounded-xl p-5 transition-all duration-200 hover:scale-[1.01] hover:border-zinc-700/70`}>
      <h3 className={`text-base font-semibold ${accent.text} capitalize mb-4`}>{brand} Strategy</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Posting Times */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-3">Optimal Posting Times</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-zinc-500 mb-1">Weekdays</p>
              <div className="flex flex-wrap gap-1">
                {times.weekday.map((t) => (
                  <Badge key={t} variant="secondary" className="bg-emerald-500/10 text-emerald-400 text-sm font-medium px-2.5 py-0.5">{t}</Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Weekends</p>
              <div className="flex flex-wrap gap-1">
                {times.weekend.map((t) => (
                  <Badge key={t} variant="secondary" className="bg-sky-500/10 text-sky-400 text-sm font-medium px-2.5 py-0.5">{t}</Badge>
                ))}
              </div>
            </div>
          </div>
          <p className="text-xs text-zinc-500 mt-2">Best days: {times.bestDays.join(', ')}</p>
          <p className="text-xs text-zinc-400 mt-1 italic">{times.reasoning}</p>
        </div>

        {/* Hashtag Strategy */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-3">Hashtag Strategy</p>
          <div className="space-y-2">
            <div>
              <p className="text-xs text-zinc-500 mb-1">Branded</p>
              <div className="flex flex-wrap gap-1">
                {tags.branded.map((tag) => (
                  <Badge key={tag} variant="outline" className={`text-xs ${accent.border} ${accent.text}`}>{tag}</Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">High Reach</p>
              <div className="flex flex-wrap gap-1">
                {tags.tier1_reach.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs border-amber-500/30 text-amber-400">{tag}</Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Medium Reach</p>
              <div className="flex flex-wrap gap-1">
                {tags.tier2_medium.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs border-zinc-600 text-zinc-400">{tag}</Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Niche</p>
              <div className="flex flex-wrap gap-1">
                {tags.tier3_niche.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs border-violet-500/30 text-violet-400">{tag}</Badge>
                ))}
              </div>
            </div>
          </div>
          <p className="text-xs text-zinc-500 mt-2">{tags.recommended}</p>
        </div>
      </div>
    </div>
  );
}

export function CompetitorDashboard() {
  const [filter, setFilter] = useState<BrandFilter>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  const filtered = filter === 'all'
    ? competitors
    : competitors.filter((c) => c.brand === filter);

  useEffect(() => {
    setLastRefreshed(new Date().toLocaleString());
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Simulate re-running competitor research (in production this would call an API)
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setLastRefreshed(new Date().toLocaleString());
    setIsRefreshing(false);
  };

  return (
    <div className="space-y-8 bg-gradient-to-b from-zinc-950 to-zinc-900/80 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 -mt-2 pt-2 pb-8 rounded-2xl">

      {/* Dashboard Purpose */}
      <div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/50 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-white">What is this dashboard?</h2>
            <p className="text-sm text-zinc-400 leading-relaxed max-w-2xl">
              This dashboard analyzes your top competitors&apos; Instagram strategies — what they post, when they post,
              and what goes viral. These insights directly feed into the <span className="text-teal-400 font-medium">Create</span> page,
              powering the Random Generator and informing caption templates, hashtag strategies, and visual styles.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Winning content formulas extracted
              </div>
              <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Optimal posting times analyzed
              </div>
              <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                Hashtag strategies mapped
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm font-medium text-white hover:bg-zinc-700 active:scale-[0.98] transition-all duration-200 disabled:opacity-50"
            >
              <span className={isRefreshing ? 'animate-spin' : ''}>&#x21bb;</span>
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <p className="text-[10px] text-zinc-600">
              {lastRefreshed ? `Last updated: ${lastRefreshed}` : '\u00A0'}
            </p>
          </div>
        </div>
      </div>

      {/* 2026 Instagram Insights Banner */}
      <div className="relative bg-zinc-900/80 backdrop-blur-sm rounded-xl overflow-hidden">
        {/* Gradient border effect */}
        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-rose-500/20 via-amber-500/20 to-emerald-500/20 p-px">
          <div className="h-full w-full bg-zinc-900/95 rounded-xl" />
        </div>

        <div className="relative p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-base">&#x2728;</span>
            <h2 className="text-base font-semibold text-white tracking-tight">2026 Instagram Strategy Insights</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-zinc-800/50 rounded-lg p-3">
              <p className="text-xs text-rose-400 font-semibold mb-1">HASHTAG LIMIT</p>
              <p className="text-sm text-white">{instagram2026Insights.hashtagLimit}</p>
              <p className="text-xs text-zinc-400 mt-1">{instagram2026Insights.keyStrategy}</p>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-3">
              <p className="text-xs text-amber-400 font-semibold mb-1">ALGORITHM PRIORITY</p>
              <p className="text-sm text-white">{instagram2026Insights.algorithmPriority}</p>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-3">
              <p className="text-xs text-emerald-400 font-semibold mb-1">BEST FORMATS</p>
              <p className="text-sm text-white">{instagram2026Insights.contentMix}</p>
              <p className="text-xs text-zinc-400 mt-1">{instagram2026Insights.carouselPerformance}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 mt-3">
            {instagram2026Insights.topFormats.map((format, i) => (
              <Badge key={i} variant="outline" className="text-xs border-zinc-700 text-zinc-300">
                {format}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Filter pill tabs */}
      <div className="flex gap-2">
        {(['all', 'affectly', 'pacebrain'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer active:scale-[0.98] ${
              filter === f
                ? f === 'affectly'
                  ? 'bg-teal-500/15 text-teal-400 border border-teal-500/30'
                  : f === 'pacebrain'
                  ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                  : 'bg-zinc-800 text-white border border-zinc-700'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50 border border-transparent'
            }`}
          >
            {f === 'all' ? 'All Competitors' : f === 'affectly' ? 'Affectly' : 'PaceBrain'}
          </button>
        ))}
      </div>

      {/* Strategy cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {(filter === 'all' || filter === 'affectly') && (
          <PostingTimesCard brand="affectly" />
        )}
        {(filter === 'all' || filter === 'pacebrain') && (
          <PostingTimesCard brand="pacebrain" />
        )}
      </div>

      <Separator className="bg-zinc-800/50" />

      {/* Competitor cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 auto-rows-fr">
        {filtered.map((competitor) => (
          <CompetitorCard key={competitor.handle} competitor={competitor} />
        ))}
      </div>
    </div>
  );
}
