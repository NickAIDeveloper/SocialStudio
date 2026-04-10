import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

export async function POST(request: NextRequest) {
  try {
    const { email, token, newPassword } = await request.json();
    if (!email || !token || !newPassword) {
      return NextResponse.json({ error: 'All fields required' }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
    if (!user) return NextResponse.json({ error: 'Invalid reset link' }, { status: 400 });

    // Verify token from image field
    let stored: { resetToken?: string; resetExpires?: string } = {};
    try { stored = JSON.parse(user.image || '{}'); } catch { /* invalid */ }

    if (!stored.resetToken || stored.resetToken !== token) {
      return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 });
    }
    if (new Date(stored.resetExpires || 0) < new Date()) {
      return NextResponse.json({ error: 'Reset link has expired' }, { status: 400 });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await db.update(users).set({ passwordHash: hash, image: null }).where(eq(users.id, user.id));

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 });
  }
}
