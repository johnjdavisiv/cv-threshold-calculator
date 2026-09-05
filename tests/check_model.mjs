/**
 * Runs the real web app (index.html + scripts.js) under jsdom and checks its model against the R goldens
 * (cv_goldens_v2026-09-05.json, computed with mgcv predict(), not with the pieces): every case's four
 * parameters, all seven quantiles, the hull status and the extrapolation banner. Also spot-checks the
 * displayed paces and the range chips.
 *
 *   node tests/check_model.mjs            (needs jsdom: `npm i --no-save jsdom` here, or run from a dir that has it
 *                                          and set NODE_PATH, e.g. NODE_PATH=../ios-app/node_modules)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const require = createRequire(import.meta.url);
let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = require('jsdom'));
} catch {
  ({ JSDOM, VirtualConsole } = require(path.resolve(root, '../ios-app/node_modules/jsdom')));
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
const script = fs.readFileSync(path.join(root, 'scripts.js'), 'utf8');
const goldens = JSON.parse(fs.readFileSync(path.join(root, 'cv_goldens_v2026-09-05.json'), 'utf8'));
const pieces = JSON.parse(fs.readFileSync(path.join(root, 'cv_pieces_v2026-09-05.json'), 'utf8'));

const ACCESSOR = `\nwindow.__m = { cvPieces, predictParams, quantileSpeed, hullStatus, hullBounds, Z, get race_dist_m() { return race_dist_m }, get dec_seconds() { return dec_seconds }, get range_level() { return range_level } };`;
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/', virtualConsole: new VirtualConsole() });
const w = dom.window;
const doc = w.document;
w.eval(script + ACCESSOR);
const m = w.__m;

const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

// 1. the inlined literal is the export file
assert.equal(JSON.stringify(m.cvPieces), JSON.stringify(pieces), 'cvPieces literal differs from cv_pieces_v2026-09-05.json');
assert.equal(pieces.version, goldens.version);
for (const k of Object.keys(goldens.z)) close(m.Z[k], goldens.z[k], 1e-13, `z ${k}`);

// 2. every golden case against predict()
let n = 0;
for (const c of goldens.cases) {
  assert.equal(m.hullStatus(c.dist_m, c.time_s) === 'inside', c.in_hull, `${c.id} hull status`);
  const b = m.hullBounds(c.dist_m);
  close(b.fast_s, c.hull_tmin_s, 1e-6, `${c.id} fast edge`);
  close(b.slow_s, c.hull_tmax_s, 1e-6, `${c.id} slow edge`);
  for (const o of ['cs_minus', 'cs', 'cs_plus']) {
    const g = c.outcomes[o];
    const p = m.predictParams(o, c.dist_m, c.time_s);
    close(p.mu, g.mu, 1e-9, `${c.id} ${o} mu`);
    close(p.sigma, g.sigma, 1e-9, `${c.id} ${o} sigma`);
    close(p.eps, g.eps, 1e-9, `${c.id} ${o} eps`);
    close(p.delta, g.delta, 1e-9, `${c.id} ${o} delta`);
    for (const q of Object.keys(g.speed_m_s)) close(m.quantileSpeed(p, q), g.speed_m_s[q], 1e-9, `${c.id} ${o} ${q}`);
    n++;
  }
}
console.log(`model: ${goldens.cases.length} cases × 3 outcomes (${n}) match R predict() to 1e-9`);

// 3. the UI: drive it like a user
const $ = (s) => doc.querySelector(s);
const $$ = (s) => [...doc.querySelectorAll(s)];
const byText = (sel, text) => {
  const el = $$(sel).find((b) => b.textContent.trim() === text);
  if (!el) throw new Error(`no ${sel} "${text}"`);
  return el;
};
const setTime = (min, sec) => {
  $('#d1').textContent = min;
  $('#d2').textContent = Math.floor(sec / 10);
  $('#d3').textContent = sec % 10;
  w.updateResult();
};
const paces = () => [$('#threshold-pace').textContent, $('#cv-pace').textContent, $('#vo2max-pace').textContent];
const ranges = () => [$('#threshold-lo').textContent, $('#threshold-hi').textContent, $('#cv-lo').textContent, $('#cv-hi').textContent, $('#vo2max-lo').textContent, $('#vo2max-hi').textContent];
const hidden = (sel) => $(sel).classList.contains('hidden');

// defaults: 18:00 5k, safe, /mi — same numbers as the iOS port's tests
setTime(18, 0);
assert.deepEqual(paces(), ['6:25', '6:02', '5:44']);
assert.deepEqual(ranges(), ['6:03', '6:25', '5:58', '6:08', '5:44', '6:00']);
assert.equal($('.range-header.uncertainty-col').textContent, '80% range');
assert.ok(hidden('.alert-box') && hidden('.extrapolation-box'));
byText('.mode-toggle', 'Median estimate').click();
assert.deepEqual(paces(), ['6:12', '6:02', '5:52']);
byText('.mode-toggle', 'Safe estimate').click();

// range chips
byText('.range-toggle', '90%').click();
assert.equal(m.range_level, 90);
assert.deepEqual(ranges(), ['6:01', '6:29', '5:56', '6:10', '5:41', '6:02']);
assert.equal($('.range-header.uncertainty-col').textContent, '90% range');
byText('.range-toggle', '95%').click();
assert.deepEqual(ranges(), ['5:59', '6:33', '5:55', '6:11', '5:39', '6:04']);
assert.deepEqual(paces(), ['6:25', '6:02', '5:44'], 'safe estimate does not move with the chips');
byText('.range-toggle', 'Off').click();
assert.equal(m.range_level, 'off');
assert.ok($$('.uncertainty-col').every((el) => el.classList.contains('hidden')), 'Off hides the range column');
assert.deepEqual(ranges(), ['6:03', '6:25', '5:58', '6:08', '5:44', '6:00'], 'ends still computed at 80% while Off');
byText('.range-toggle', '80%').click();
assert.ok($$('.uncertainty-col').every((el) => !el.classList.contains('hidden')));

// extrapolation banner
setTime(32, 0);
assert.ok(!hidden('.extrapolation-box') && hidden('.alert-box'));
assert.equal($('.extrapolation-box .alert-text').textContent, '⚠️ Few runners in our dataset ran slower than 30:00 for 5 km, so these paces are extrapolated.');
setTime(30, 0);
assert.ok(hidden('.extrapolation-box'), '30:00 is inside');
setTime(12, 0);
assert.equal($('.extrapolation-box .alert-text').textContent, '⚠️ Few runners in our dataset ran faster than 12:18 for 5 km, so these paces are extrapolated.');
byText('.race-button', '10 km').click();
setTime(65, 0);
assert.equal($('.extrapolation-box .alert-text').textContent, '⚠️ Few runners in our dataset ran slower than 60:00 for 10 km, so these paces are extrapolated.');
byText('.race-button', '1 mi').click();
setTime(9, 0);
assert.equal($('.extrapolation-box .alert-text').textContent, '⚠️ Few runners in our dataset ran slower than 8:47 for 1 mi, so these paces are extrapolated.');
// custom distances
byText('.race-button', 'custom distance').click();
byText('.custom-toggle', 'kilometers').click();
$('#custom-km').value = '12';
$('#custom-km').dispatchEvent(new w.Event('input', { bubbles: true }));
setTime(45, 0);
assert.equal($('.extrapolation-box .alert-text').textContent, '⚠️ Few runners in our dataset raced longer than 10 km, so these paces are extrapolated.');
byText('.custom-toggle', 'meters').click();
$('#custom-m').value = '600';
$('#custom-m').dispatchEvent(new w.Event('input', { bubbles: true }));
setTime(1, 45);
assert.equal($('.extrapolation-box .alert-text').textContent, '⚠️ Few runners in our dataset raced shorter than 800 m, so these paces are extrapolated.');
// 🤔 wins over the extrapolation box
byText('.race-button', '800m').click();
setTime(18, 0);
assert.deepEqual(paces(), ['🤔', '🤔', '🤔']);
assert.ok(!hidden('.alert-box') && hidden('.extrapolation-box'));
assert.deepEqual(ranges(), ['', '', '', '', '', '']);
// exactly 10 m/s is inside the guard
setTime(1, 20);
assert.notEqual(paces()[0], '🤔');
setTime(1, 19);
assert.equal(paces()[0], '🤔');

console.log('ui: defaults, mode, range chips, extrapolation banner variants, speed guard — all as expected');
