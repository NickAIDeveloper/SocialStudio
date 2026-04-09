import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { linkedAccounts } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { decrypt } from '@/lib/encryption';
import { getQueuedPosts, getSentPosts, type BufferPost } from '@/lib/buffer';

interface CalendarDay {
  date: string; // ISO date string (YYYY-MM-DD)
  dayName: string;
  posts: Array<{
    id: string;
    text: string;
    dueAt: string | null;
    status: string;
    channelService: string;
    time: string; // HH:MM formatted
  }>;
}

export async function GET() {
  try {
    const userId = await getUserId();

    // Get Buffer API key from linked accounts
    const [bufferAccount] = await db
      .select()
      .from(linkedAccounts)
      .where(
        and(
          eq(linkedAccounts.userId, userId),
          eq(linkedAccounts.provider, 'buffer'),
        ),
      );

    if (!bufferAccount?.accessToken) {
      return NextResponse.json({
        success: true,
        days: [],
        message: 'Connect Buffer in Settings to see your content calendar',
      });
    }

    let apiKey: string;
    try {
      apiKey = decrypt(bufferAccount.accessToken);
    } catch {
      return NextResponse.json({ success: false, days: [], message: 'Buffer connection needs to be refreshed in Settings' });
    }

    let posts: BufferPost[] = [];
    try {
      const [queued, sent] = await Promise.all([
        getQueuedPosts(apiKey),
        getSentPosts(apiKey),
      ]);
      // Merge and deduplicate by ID
      const seen = new Set<string>();
      for (const p of [...queued, ...sent]) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          posts.push(p);
        }
      }
    } catch (err) {
      console.error('[Calendar] Buffer fetch error:', err);
      return NextResponse.json({
        success: false,
        days: [],
        message: 'Could not fetch posts from Buffer',
      });
    }

    // Organize posts by day: 3 days back + today + 6 days forward = 10 days
    const now = new Date();
    const days: CalendarDay[] = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let i = -3; i < 7; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      const dayName = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : i === -1 ? 'Yesterday' : dayNames[date.getDay()];

      const dayPosts = posts
        .filter((p) => {
          const postDate = p.dueAt ? new Date(p.dueAt) : new Date(p.createdAt);
          return postDate.toISOString().split('T')[0] === dateStr;
        })
        .map((p) => {
          const postDate = p.dueAt ? new Date(p.dueAt) : new Date(p.createdAt);
          return {
            id: p.id,
            text: p.text,
            dueAt: p.dueAt,
            status: p.status,
            channelService: p.channelService,
            time: postDate.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            }),
          };
        })
        .sort((a, b) => {
          const aTime = a.dueAt ? new Date(a.dueAt).getTime() : 0;
          const bTime = b.dueAt ? new Date(b.dueAt).getTime() : 0;
          return aTime - bTime;
        });

      days.push({ date: dateStr, dayName, posts: dayPosts });
    }

    return NextResponse.json({ success: true, days });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Calendar] Error:', error);
    return NextResponse.json({ error: 'Failed to load calendar' }, { status: 500 });
  }
}
