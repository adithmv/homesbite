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
    role: 'customer' | 'restaurant' | 'rider' | 'admin';
    vehicle?: string;
    lat?: number;
    lng?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { email, password, name, phone, role, vehicle, lat, lng } = body;

  if (!email || !password || !name || !role) {
    return NextResponse.json({ error: 'Email, password, name, and role are required' }, { status: 400 });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanPhone = (phone || '').replace(/[^0-9]/g, '') || '9876543210';

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Call direct_register RPC
  const { data: userId, error: rpcError } = await supabase.rpc('direct_register', {
    p_email: cleanEmail,
    p_password: password,
    p_name: name.trim(),
    p_phone: cleanPhone,
    p_role: role,
    p_vehicle: vehicle || 'Bike',
    p_lat: lat ?? null,
    p_lng: lng ?? null,
  });

  if (rpcError) {
    console.error('direct_register rpc error:', rpcError);
    return NextResponse.json({ error: rpcError.message }, { status: 400 });
  }

  // Sign in immediately to establish authenticated session
  let { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });

  // If email was unconfirmed, auto-confirm it and retry
  if (signInError && signInError.message.toLowerCase().includes('not confirmed')) {
    try {
      await supabase.rpc('confirm_user_email', { p_email: cleanEmail });
      const retry = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      signInData = retry.data;
      signInError = retry.error;
    } catch (e) {
      console.error('Confirm retry error:', e);
    }
  }

  if (signInError || !signInData?.session) {
    console.error('signInWithPassword error after direct_register:', signInError);
    return NextResponse.json({
      error: signInError?.message || 'Registration succeeded but session could not be established. Please sign in.',
    }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    userId,
    session: signInData.session,
  });
}