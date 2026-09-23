import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  let body: {
    email: string;
    password: string;
    name: string;
    phone: string;
    role: 'customer' | 'restaurant' | 'rider';
    vehicle?: string;
    lat?: number;
    lng?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { email, password, name, phone, role, vehicle, lat, lng } = body;
  if (!email || !password || !name || !phone || !role) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.rpc('direct_register', {
    p_email: email,
    p_password: password,
    p_name: name,
    p_phone: phone,
    p_role: role,
    p_vehicle: vehicle || 'Bike',
    p_lat: lat ?? null,
    p_lng: lng ?? null,
  });
  if (error) {
    console.error('direct_register error', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  // Sign in the user immediately to get a session
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError || !signInData.session) {
    return NextResponse.json({ error: 'Registration succeeded but auto sign-in failed. Please sign in manually.' }, { status: 200 });
  }
  return NextResponse.json({
    ok: true,
    userId: data,
    session: signInData.session,
  });
}