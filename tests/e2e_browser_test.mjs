import puppeteer from 'puppeteer-core';
import path from 'path';

const ARTIFACT_DIR = 'C:\\Users\\Adith\\.gemini\\antigravity\\brain\\735738a6-7899-4586-97b7-cb3fb976de60';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'https://homesbite-beryl.vercel.app';

console.log('======================================================');
console.log('RUNNING FULL AUTOMATED BROWSER TEST (HEADLESS CHROME)');
console.log('Target:', BASE_URL);
console.log('Artifacts:', ARTIFACT_DIR);
console.log('======================================================\n');

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('   [Browser Console Error]:', msg.text());
    }
  });

  page.on('pageerror', err => {
    console.log('   [Browser Page Error]:', err.message);
  });

  // 1. TEST RIDER
  console.log('>>> 1. Testing Rider Login...');
  try {
    await page.goto(`${BASE_URL}/login?role=rider`, { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '1_rider_login_page.png') });
    console.log('   Loaded rider login page.');

    await page.type('input[name="email"]', 'sam.rider@homesbite.com');
    await page.type('input[name="password"]', 'RiderPass123!');
    await page.click('button.button.full');

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '2_rider_dashboard.png') });
    console.log('   Current URL after rider login:', page.url());

    const isRiderUrl = page.url().includes('/rider');
    console.log('   Rider Dashboard reached:', isRiderUrl ? 'YES ✅' : 'NO ❌');
  } catch (err) {
    console.error('   Rider test error:', err.message);
  }

  // Clear cookies/storage before next test
  const client = await page.target().createCDPSession();
  await client.send('Network.clearBrowserCookies');
  await client.send('Network.clearBrowserCache');

  // 2. TEST KITCHEN
  console.log('\n>>> 2. Testing Kitchen Login...');
  try {
    await page.goto(`${BASE_URL}/login?role=restaurant`, { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '3_kitchen_login_page.png') });
    console.log('   Loaded kitchen login page.');

    await page.type('input[name="email"]', 'everydaykitchen@homesbite.com');
    await page.type('input[name="password"]', 'KitchenPass123!');
    await page.click('button.button.full');

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '4_kitchen_dashboard.png') });
    console.log('   Current URL after kitchen login:', page.url());

    const isKitchenUrl = page.url().includes('/restaurant');
    console.log('   Kitchen Dashboard reached:', isKitchenUrl ? 'YES ✅' : 'NO ❌');
  } catch (err) {
    console.error('   Kitchen test error:', err.message);
  }

  await client.send('Network.clearBrowserCookies');
  await client.send('Network.clearBrowserCache');

  // 3. TEST CUSTOMER
  console.log('\n>>> 3. Testing Customer Direct Signup & Food Ordering...');
  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
    
    // Click "Create account" tab
    const tabs = await page.$$('.auth-tabs button');
    for (const tab of tabs) {
      const text = await page.evaluate(el => el.textContent, tab);
      if (text.includes('Create account')) {
        await tab.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '5_customer_signup_form.png') });
    console.log('   Switched to Create Account tab.');

    const newEmail = `user_${Date.now()}@homesbite.com`;
    console.log('   Signing up with email:', newEmail);

    await page.type('input[name="name"]', 'Arjun Mehta');
    await page.type('input[name="phone"]', '9876543255');
    await page.type('input[name="email"]', newEmail);
    await page.type('input[name="password"]', 'CustomerPass123!');

    await page.screenshot({ path: path.join(ARTIFACT_DIR, '6_customer_filled_form.png') });
    await page.click('button.button.full');

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '7_customer_home_after_signup.png') });
    console.log('   Current URL after signup:', page.url());

    const isHome = page.url() === `${BASE_URL}/` || page.url().endsWith('/');
    console.log('   Direct login & home redirect:', isHome ? 'YES ✅' : 'NO ❌');

    // Browse a restaurant and add to cart
    console.log('   Browsing restaurant page...');
    await page.goto(`${BASE_URL}/r/the-everyday-kitchen`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '8_restaurant_menu.png') });

    // Try adding the first available dish to cart
    const addButtons = await page.$$('button');
    let added = false;
    for (const btn of addButtons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text.includes('Add') || text.includes('+')) {
        await btn.click();
        added = true;
        break;
      }
    }
    console.log('   Added dish to cart:', added ? 'YES ✅' : 'NO (or cart button not found)');
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '9_cart_view.png') });
  } catch (err) {
    console.error('   Customer test error:', err.message);
  }

  await client.send('Network.clearBrowserCookies');
  await client.send('Network.clearBrowserCache');

  // 4. TEST ADMIN
  console.log('\n>>> 4. Testing Admin Login...');
  try {
    await page.goto(`${BASE_URL}/admin/login`, { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '10_admin_login_page.png') });
    console.log('   Loaded admin login page.');

    await page.type('input[name="email"]', 'agronilife@gmail.com');
    await page.type('input[name="password"]', 'Admin..123456');
    await page.click('button.button.full');

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '11_admin_panel.png') });
    console.log('   Current URL after admin login:', page.url());

    const isAdminUrl = page.url().includes('/admin');
    console.log('   Admin URL reached:', isAdminUrl ? 'YES ✅' : 'NO ❌');
  } catch (err) {
    console.error('   Admin test error:', err.message);
  }

  await browser.close();
  console.log('\n======================================================');
  console.log('AUTOMATED BROWSER TEST COMPLETE! All screenshots saved.');
  console.log('======================================================');
}

run();
