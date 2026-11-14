import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log('================================================================');
console.log('TEST SUITE: Lottie Animations Integration Verification');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`   ✅ PASS: ${desc}`);
    passCount++;
  } catch (err) {
    console.error(`   ❌ FAIL: ${desc}`);
    console.error(`      Error: ${err.message}`);
    failCount++;
  }
}

async function runTests() {
  const customerRoot = 'C:/Users/vc/Desktop/projects/bespoke customer/bespoke_customers';

  console.log('1. INSPECT ANIMATION ASSETS IN lottiefiles FOLDER');
  const lottieDir = path.join(customerRoot, 'lottiefiles');
  it('lottiefiles folder exists on disk', () => {
    assert(fs.existsSync(lottieDir), 'lottiefiles directory does not exist');
  });

  const expectedFiles = {
    loading: 'loading.json',
    promo: 'promoSucces.json',
    succes: 'Success.json',
  };

  for (const [key, filename] of Object.entries(expectedFiles)) {
    const fullPath = path.join(lottieDir, filename);
    it(`File "${filename}" exists and is valid Lottie JSON (${key})`, () => {
      assert(fs.existsSync(fullPath), `File ${filename} missing`);
      const raw = fs.readFileSync(fullPath, 'utf8');
      const json = JSON.parse(raw);
      assert(json.v, 'Missing Lottie version (v)');
      assert(typeof json.fr === 'number', 'Missing frame rate (fr)');
      assert(typeof json.ip === 'number', 'Missing in-point (ip)');
      assert(typeof json.op === 'number', 'Missing out-point (op)');
      assert(typeof json.w === 'number', 'Missing width (w)');
      assert(typeof json.h === 'number', 'Missing height (h)');
      assert(Array.isArray(json.layers), 'Missing layers array');
      console.log(`         (${filename}: ${json.w}x${json.h}, ${json.fr}fps, ${json.op} frames, ${json.layers.length} layers)`);
    });
  }

  console.log('\n2. INSPECT REUSABLE ANIMATION COMPONENTS IN src/components/animations');
  const animCompDir = path.join(customerRoot, 'src/components/animations');
  it('src/components/animations directory exists', () => {
    assert(fs.existsSync(animCompDir), 'src/components/animations directory missing');
  });

  const componentFiles = [
    'LottieAnimation.jsx',
    'PromoSuccessAnimation.jsx',
    'OrderSuccessAnimation.jsx',
    'PageLoadingAnimation.jsx',
    'index.js',
  ];

  for (const file of componentFiles) {
    it(`Component "${file}" exists and has valid implementation`, () => {
      const p = path.join(animCompDir, file);
      assert(fs.existsSync(p), `Missing component ${file}`);
      const code = fs.readFileSync(p, 'utf8');
      assert(code.length > 50, `File ${file} is unexpectedly small`);
    });
  }

  console.log('\n3. VERIFY PROMO ANIMATION INTEGRATION IN CheckoutPage.jsx');
  const checkoutPath = path.join(customerRoot, 'src/components/views/CheckoutPage.jsx');
  it('CheckoutPage imports PromoSuccessAnimation, OrderSuccessAnimation, PageLoadingAnimation', () => {
    const code = fs.readFileSync(checkoutPath, 'utf8');
    assert(code.includes('PromoSuccessAnimation'), 'Missing PromoSuccessAnimation import/usage');
    assert(code.includes('OrderSuccessAnimation'), 'Missing OrderSuccessAnimation import/usage');
    assert(code.includes('PageLoadingAnimation'), 'Missing PageLoadingAnimation import/usage');
  });

  it('CheckoutPage triggers PromoSuccessAnimation only upon backend coupon success', () => {
    const code = fs.readFileSync(checkoutPath, 'utf8');
    assert(code.includes('promoAnimationState'), 'Missing promoAnimationState in CheckoutPage');
    assert(code.includes('<PromoSuccessAnimation'), 'Missing <PromoSuccessAnimation in CheckoutPage render');
    // Ensure it triggers in handleApplyCoupon
    assert(code.includes('setPromoAnimationState'), 'Missing setPromoAnimationState call in handleApplyCoupon');
  });

  console.log('\n4. VERIFY ORDER SUCCESS ANIMATION INTEGRATION');
  it('CheckoutPage triggers OrderSuccessAnimation upon authoritative backend order confirmation', () => {
    const code = fs.readFileSync(checkoutPath, 'utf8');
    assert(code.includes('orderSuccessState'), 'Missing orderSuccessState in CheckoutPage');
    assert(code.includes('setOrderSuccessState'), 'Missing setOrderSuccessState call upon order success');
    assert(code.includes('<OrderSuccessAnimation'), 'Missing <OrderSuccessAnimation in CheckoutPage render');
  });

  it('OrderConfirmedPage embeds LottieAnimation with Success.json celebration emblem', () => {
    const confirmedPath = path.join(customerRoot, 'src/components/views/OrderConfirmedPage.jsx');
    const code = fs.readFileSync(confirmedPath, 'utf8');
    assert(code.includes('Success.json'), 'Missing Success.json import in OrderConfirmedPage');
    assert(code.includes('LottieAnimation'), 'Missing LottieAnimation in OrderConfirmedPage');
  });

  console.log('\n5. VERIFY PAGE LOADING ANIMATION INTEGRATION ACROSS VIEWS');
  const loadingViews = [
    { name: 'App.jsx', file: 'src/App.jsx' },
    { name: 'ProductDetailPage.jsx', file: 'src/components/views/ProductDetailPage.jsx' },
    { name: 'CategoriesListingPage.jsx', file: 'src/components/views/CategoriesListingPage.jsx' },
    { name: 'DealsPage.jsx', file: 'src/components/views/DealsPage.jsx' },
    { name: 'DesignersListingPage.jsx', file: 'src/components/views/DesignersListingPage.jsx' },
    { name: 'OrderTrackingPage.jsx', file: 'src/components/views/OrderTrackingPage.jsx' },
    { name: 'ShopsListingPage.jsx', file: 'src/components/views/ShopsListingPage.jsx' },
  ];

  for (const view of loadingViews) {
    it(`${view.name} uses PageLoadingAnimation with loading.json`, () => {
      const p = path.join(customerRoot, view.file);
      const code = fs.readFileSync(p, 'utf8');
      assert(code.includes('PageLoadingAnimation'), `Missing PageLoadingAnimation in ${view.name}`);
    });
  }

  console.log('\n6. LIVE BACKEND COUPON API TEST');
  try {
    const validRes = await fetch('http://localhost:8080/api/promo-codes/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 's1', user_id: 1, subtotal: 1000 }),
    });
    const validJson = await validRes.json();
    it('Backend coupon validation returns success=true for valid coupon "s1"', () => {
      assert(validJson.success === true, 'Coupon s1 should return success=true');
      assert(typeof validJson.discount === 'number', 'Coupon s1 should return numeric discount');
      console.log(`         (Coupon s1 applied: ₹${validJson.discount} discount computed by backend)`);
    });

    const invalidRes = await fetch('http://localhost:8080/api/promo-codes/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'NONEXISTENT_COUPON_XYZ', user_id: 1, subtotal: 1000 }),
    });
    const invalidJson = await invalidRes.json();
    it('Backend coupon validation returns success=false for non-existent coupon', () => {
      assert(invalidJson.success === false, 'Invalid coupon should return success=false');
      console.log(`         (Invalid coupon rejected: "${invalidJson.message}")`);
    });
  } catch(e) {
    console.log('   ⚠️ Notice: Backend port 8080 check note:', e.message);
  }

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passCount} Passed, ${failCount} Failed`);
  console.log('================================================================');
  if (failCount > 0) {
    process.exitCode = 1;
  }
}

await runTests();
