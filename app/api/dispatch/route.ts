import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization') || '';
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(auth);
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    return NextResponse.json({ error: 'Dispatch is not configured' }, { status: 503 });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await db.rpc('dispatch_orders');
  if (error) {
    console.error('Dispatch failed', error.code);
    return NextResponse.json({ error: 'Dispatch failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
