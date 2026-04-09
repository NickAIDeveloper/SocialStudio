'use client';

import { useState, useEffect, useCallback } from 'react';
import { Calendar, Clock, RefreshCw, Loader2, AlertCircle } from 'lucide-react';

interface CalendarPost {
  id: string;
  text: string;
  dueAt: string | null;
  status: string;
  channelService: string;
  time: string;
}

interface CalendarDay {
  date: string;
  dayName: string;
  posts: CalendarPost[];
}

export function ContentCalendar() {
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCalendar = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch('/api/calendar');
      if (!res.ok) {
        setMessage('Failed to load calendar');
        return;
      }
      const data = await res.json();
      if (data.success) {
        setDays(data.days ?? []);
        setMessage(data.message ?? null);
      }
    } catch {
      setMessage('Failed to load calendar');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchCalendar();
  }, [fetchCalendar]);

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/60 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-5 w-40 rounded bg-zinc-700/50 animate-pulse" />
        </div>
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-32 rounded-lg bg-zinc-800/40 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const totalPosts = days.reduce((sum, d) => sum + d.posts.length, 0);

  return (
    <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/60 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/10">
            <Calendar className="h-4 w-4 text-teal-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
              Content Calendar
            </h3>
            <p className="text-xs text-white">
              {totalPosts > 0
                ? `${totalPosts} post${totalPosts !== 1 ? 's' : ''} this week`
                : 'Your week at a glance — sent and scheduled'}
            </p>
          </div>
        </div>
        <button
          onClick={() => void fetchCalendar(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700 border border-zinc-700 disabled:opacity-50"
        >
          {refreshing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Refresh
        </button>
      </div>

      {message && days.length === 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-zinc-700/50 bg-zinc-800/30 px-4 py-3 text-sm text-white">
          <AlertCircle className="h-4 w-4 text-zinc-400 flex-shrink-0" />
          {message}
        </div>
      )}

      {/* Weekly grid - scrollable if more than 7 days */}
      <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
        {days.map((day) => {
          const isToday = day.dayName === 'Today';
          const isPast = day.dayName === 'Yesterday' || new Date(day.date + 'T23:59:59') < new Date();
          return (
            <div
              key={day.date}
              className={`rounded-lg border p-3 min-h-[120px] flex flex-col ${
                isToday
                  ? 'border-teal-500/30 bg-teal-500/5'
                  : isPast
                    ? 'border-zinc-800/50 bg-zinc-800/10 opacity-70'
                    : 'border-zinc-700/50 bg-zinc-800/20'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className={`text-xs font-semibold ${
                    isToday ? 'text-teal-400' : 'text-white'
                  }`}
                >
                  {day.dayName}
                </span>
                <span className="text-[10px] text-white">
                  {new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>

              <div className="flex-1 space-y-1.5">
                {day.posts.length === 0 ? (
                  <p className="text-[10px] text-zinc-500 italic">No posts</p>
                ) : (
                  day.posts.map((post) => {
                    const isSent = post.status === 'sent';
                    return (
                    <div
                      key={post.id}
                      className={`rounded px-2 py-1.5 ${
                        isSent
                          ? 'bg-emerald-500/10 border border-emerald-500/20'
                          : 'bg-zinc-700/40 border border-zinc-600/30'
                      }`}
                    >
                      <div className="flex items-center gap-1 mb-0.5">
                        <Clock className={`h-2.5 w-2.5 ${isSent ? 'text-emerald-400' : 'text-teal-400'}`} />
                        <span className={`text-[10px] font-medium ${isSent ? 'text-emerald-300' : 'text-teal-300'}`}>
                          {post.time}
                        </span>
                        {isSent && (
                          <span className="text-[8px] uppercase font-bold text-emerald-400 ml-1">sent</span>
                        )}
                      </div>
                      <p className="text-[10px] text-white leading-tight line-clamp-2">
                        {post.text.replace(/#\w+/g, '').trim().slice(0, 80)}
                      </p>
                    </div>
                    );
                  })
                )}
              </div>

              {day.posts.length > 0 && (
                <div className="mt-1.5 pt-1.5 border-t border-zinc-700/30">
                  <span className="text-[10px] font-medium text-white">
                    {day.posts.length} post{day.posts.length !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
