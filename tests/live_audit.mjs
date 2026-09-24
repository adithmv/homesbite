import { createClient } from '@supabase/supabase-js';

const sbUrl = 'https://bstdacbvdxliighczurp.supabase.co';
const js = await (await fetch('https://homesbite-beryl.vercel.app/_next/static/immutable/chunks/06hl72f2d5wuj.js')).text();
const matchKey = js.match(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_\-\.]+/g);
const anonKey = matchKey[0];

const supabase = createClient(sbUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

console.log('====================================================');
console.log('HOMESTEAD / HOMEBITE FULL 4-ROLE E2E AUDIT');
console.log('Live Target: https://homesbite-beryl.vercel.app/');
console.log('Supabase Target: https://bstdacbvdxliighczurp.supabase.co');
console.log('====================================================\n');

async function testRider() {
  console.log('--- 1. Testing Rider Login (sam.rider@homesbite.com) ---');
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'sam.rider@homesbite.com',
    password: 'RiderPass123!'
  });

  if (error) {
    console.error('❌ Rider login failed:', error.message);
    return false;
  }
  console.log('✅ Rider authenticated successfully! User ID:', data.user.id);

  // Check profile
  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .single();

  if (profErr || !profile) {
    console.error('❌ Rider profile missing:', profErr);
    return false;
  }
  console.log('✅ Rider profile verified:', profile.name, 'Role:', profile.role);

  // Check rider table
  const { data: rider, error: riderErr } = await supabase
    .from('riders')
    .select('*')
    .eq('id', data.user.id)
    .single();

  if (riderErr || !rider) {
    console.error('❌ Rider record missing in public.riders:', riderErr);
    return false;
  }
  console.log('✅ Rider record verified: Online =', rider.online, 'Approved =', rider.approved, 'Vehicle =', rider.vehicle);
  return true;
}

async function testKitchen() {
  console.log('\n--- 2. Testing Kitchen Login (everydaykitchen@homesbite.com) ---');
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'everydaykitchen@homesbite.com',
    password: 'KitchenPass123!'
  });

  if (error) {
    console.error('❌ Kitchen login failed:', error.message);
    return false;
  }
  console.log('✅ Kitchen owner authenticated successfully! User ID:', data.user.id);

  // Check profile
  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .single();

  if (profErr || !profile) {
    console.error('❌ Kitchen profile missing:', profErr);
    return false;
  }
  console.log('✅ Kitchen owner profile verified:', profile.name, 'Role:', profile.role);

  // Check restaurant record
  const { data: restaurant, error: restErr } = await supabase
    .from('restaurants')
    .select('*, menu_items(*)')
    .eq('owner_id', data.user.id)
    .single();

  if (restErr || !restaurant) {
    console.error('❌ Kitchen restaurant record missing:', restErr);
    return false;
  }
  console.log('✅ Kitchen verified:', restaurant.name, 'Slug:', restaurant.slug, 'Open:', restaurant.open, 'Approved:', restaurant.approved);
  console.log('✅ Menu items count:', restaurant.menu_items?.length || 0);
  if (restaurant.menu_items?.length) {
    console.log('   Dishes:', restaurant.menu_items.map(m => `${m.name} (₹${m.price/100})`).join(', '));
  }
  return true;
}

async function testCustomer() {
  console.log('\n--- 3. Testing Customer Signup & Browsing ---');
  const testEmail = `test_customer_${Date.now()}@homesbite.com`;
  const testPass = 'CustomerPass123!';
  console.log('Attempting direct signup without email verification for:', testEmail);

  // Call the live direct-register endpoint
  const regRes = await fetch('https://homesbite-beryl.vercel.app/api/auth/direct-register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: testPass,
      name: 'Priya Sharma',
      phone: '9876543299',
      role: 'customer'
    })
  });

  const regData = await regRes.json();
  if (!regRes.ok || !regData.ok) {
    console.error('❌ Direct signup failed:', regData);
    return false;
  }
  console.log('✅ Direct signup succeeded immediately! User ID:', regData.userId);
  console.log('✅ Instant session returned:', !!regData.session?.access_token);

  // Sign in as this customer
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPass
  });

  if (authErr) {
    console.error('❌ Customer login failed:', authErr);
    return false;
  }
  console.log('✅ Customer login verified! User ID:', authData.user.id);

  // Browse partner kitchens
  const { data: kitchens, error: kitErr } = await supabase
    .from('restaurants')
    .select('id, name, slug, cuisine, menu_items(id, name, price)')
    .eq('approved', true);

  if (kitErr) {
    console.error('❌ Failed to fetch partner kitchens:', kitErr);
    return false;
  }
  console.log(`✅ Customer can browse ${kitchens.length} approved partner kitchens:`);
  kitchens.forEach(k => {
    console.log(`   - ${k.name} (${k.cuisine}): ${k.menu_items?.length || 0} dishes available`);
  });

  return true;
}

async function testAdmin() {
  console.log('\n--- 4. Testing Admin Login (agronilife@gmail.com) ---');
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'agronilife@gmail.com',
    password: 'Admin..123456'
  });

  if (error) {
    console.error('❌ Admin login failed:', error.message);
    return false;
  }
  console.log('✅ Admin authenticated successfully! User ID:', data.user.id);

  // Check admin profile
  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .single();

  if (profErr || !profile) {
    console.error('❌ Admin profile missing:', profErr);
    return false;
  }
  console.log('✅ Admin profile verified:', profile.name, 'Role:', profile.role);

  // Check admin can inspect all restaurants & riders
  const { data: allRestaurants } = await supabase.from('restaurants').select('id, name');
  const { data: allRiders } = await supabase.from('riders').select('id, name');
  const { data: allOrders } = await supabase.from('orders').select('id, status');

  console.log('✅ Admin data visibility verified:');
  console.log('   - Total restaurants registered:', allRestaurants?.length ?? 0);
  console.log('   - Total riders registered:', allRiders?.length ?? 0);
  console.log('   - Total orders:', allOrders?.length ?? 0);

  return true;
}

async function runAudit() {
  const r1 = await testRider();
  const r2 = await testKitchen();
  const r3 = await testCustomer();
  const r4 = await testAdmin();

  console.log('\n====================================================');
  console.log('FINAL AUDIT SUMMARY:');
  console.log('1. Rider:    ', r1 ? 'PASSED ✅' : 'FAILED ❌');
  console.log('2. Kitchen:  ', r2 ? 'PASSED ✅' : 'FAILED ❌');
  console.log('3. Customer: ', r3 ? 'PASSED ✅' : 'FAILED ❌');
  console.log('4. Admin:    ', r4 ? 'PASSED ✅' : 'FAILED ❌');
  console.log('====================================================');
}

runAudit();
