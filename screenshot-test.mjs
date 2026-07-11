import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

// Capture console logs
const logs = [];
page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => logs.push(`[PAGE_ERROR] ${err.message}`));

await page.goto('https://leads-admin2.vercel.app/', { waitUntil: 'networkidle', timeout: 30000 }).catch(e => logs.push(`[NAV_ERROR] ${e.message}`));

// Wait a moment for any async rendering
await page.waitForTimeout(2000);

await page.screenshot({ path: '/tmp/leads-dashboard.png', fullPage: true });

// Check what's visible
const text = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || 'NO BODY TEXT');
const rootHtml = await page.evaluate(() => document.getElementById('root')?.innerHTML?.substring(0, 300) || 'NO ROOT HTML');

console.log('=== VISIBLE TEXT ===');
console.log(text);
console.log('=== ROOT INNER HTML ===');
console.log(rootHtml);
console.log('=== CONSOLE LOGS ===');
console.log(logs.join('\n'));

await browser.close();
