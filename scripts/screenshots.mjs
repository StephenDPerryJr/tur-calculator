// Smoke test + screenshots of the built app using the system Chrome via playwright-core.
// Usage: npm run build && npm run preview (in another shell) && node scripts/screenshots.mjs [url]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] || 'http://127.0.0.1:4173/';
const OUT = new globalThis.URL('../screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const executablePath = process.env.CHROME_PATH || '/usr/bin/google-chrome';

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const problems = [];
const watch = (page, tag) => {
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${tag}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${tag}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`[${tag}] requestfailed: ${r.url()}`));
};
const txt = (p, id) => p.getByTestId(id).innerText();

// ---------- desktop
const desk = await browser.newPage({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 });
watch(desk, 'desktop');
await desk.goto(URL, { waitUntil: 'networkidle' });
await desk.evaluate(() => localStorage.clear());
await desk.reload({ waitUntil: 'networkidle' });
const title = await desk.title();
const out = { title };

await desk.getByTestId('ex-dmm').click();
out.dmm = { tur: await txt(desk, 'tur'), verdict: await txt(desk, 'verdict'), U95: await txt(desk, 'U95'), tar: await txt(desk, 'tar'), pfa: await txt(desk, 'pfa') };
await desk.getByTestId('ex-caliper').click();
out.caliper = { tur: await txt(desk, 'tur'), verdict: await txt(desk, 'verdict'), tar: await txt(desk, 'tar') };
await desk.screenshot({ path: OUT + '01-calculator-caliper-desktop.png', fullPage: true });

// risk tab: guard band comparison
await desk.getByTestId('tab-risk').click();
await desk.waitForSelector('[data-testid="guard-table"]');
await desk.getByTestId('measured').fill('100.012');
out.caliperSpecific = await txt(desk, 'specific');
await desk.getByTestId('q-tur').fill('4');
await desk.getByTestId('q-eopr').fill('95');
out.quick4to1at95 = await txt(desk, 'q-pfa');
await desk.screenshot({ path: OUT + '02-risk-guardbands-desktop.png', fullPage: true });

// multi-point table + report + docs render
await desk.getByTestId('tab-table').click();
await desk.getByTestId('tex-dmm').click();
await desk.getByTestId('tex-pressure').click();
await desk.waitForSelector('[data-testid="points-table"]');
out.tableRows = await desk.locator('[data-testid="points-table"] tbody tr').count();
await desk.screenshot({ path: OUT + '04-multipoint-table-desktop.png', fullPage: false });
await desk.getByTestId('tab-report').click();
await desk.waitForSelector('[data-testid="report-frame"]');
await desk.waitForTimeout(300);
await desk.getByTestId('tab-howto').click();
await desk.waitForSelector('[data-testid="howto-caliper"]');
await desk.screenshot({ path: OUT + '05-howto-desktop.png', fullPage: false });
await desk.getByTestId('tab-glossary').click();

// one-sided + asymmetric don't crash
await desk.getByTestId('tab-calc').click();
await desk.getByTestId('ex-onesided').click();
out.onesided = await txt(desk, 'tur');
await desk.getByTestId('tol-kind').selectOption('asymmetric');
await desk.getByTestId('tab-risk').click();
await desk.waitForTimeout(200);

// ---------- phone
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
watch(phone, 'phone');
await phone.goto(URL, { waitUntil: 'networkidle' });
await phone.evaluate(() => localStorage.clear());
await phone.reload({ waitUntil: 'networkidle' });
await phone.getByTestId('ex-pressure').click();
out.pressure = { tur: await txt(phone, 'tur'), verdict: await txt(phone, 'verdict') };
await phone.getByTestId('result').evaluate((el) => el.scrollIntoView({ block: 'start' }));
await phone.screenshot({ path: OUT + '03-result-pressure-phone.png', fullPage: false });

await browser.close();
console.log(JSON.stringify({ ...out, problems }, null, 2));
process.exit(problems.length ? 1 : 0);
