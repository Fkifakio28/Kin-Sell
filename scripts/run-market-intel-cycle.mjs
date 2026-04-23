/**
 * Lance un cycle complet Market Intel côté serveur.
 * Usage: node scripts/run-market-intel-cycle.mjs  (depuis racine du repo)
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

process.env.ENABLE_MARKET_INTEL = 'true';

const apiDist = path.resolve(process.cwd(), 'apps/api/dist/modules/market-intel');
const load = (f) => import(pathToFileURL(path.join(apiDist, f)).href);

const { runCrawlCycle } = await load('orchestrator.js');
const { runAggregation } = await load('aggregator.js');
const { computeTrends } = await load('trends.js');
const { runArbitrage } = await load('arbitrage.js');

const types = ['marketplace', 'jobs', 'classifieds', 'stats', 'news'];
const report = {};

for (const t of types) {
  console.log(`\n▶ Crawl ${t}…`);
  try {
    report[t] = await runCrawlCycle(t, 50);
    console.log(JSON.stringify(report[t], null, 2));
  } catch (e) {
    console.error(`❌ ${t}:`, e?.message);
    report[t] = { error: e?.message };
  }
}

console.log('\n▶ Aggregate…');
try { report.aggregate = await runAggregation(); console.log(JSON.stringify(report.aggregate, null, 2)); }
catch (e) { console.error('❌ aggregate:', e?.message); }

console.log('\n▶ Trends…');
try { report.trends = await computeTrends(); console.log(JSON.stringify(report.trends, null, 2)); }
catch (e) { console.error('❌ trends:', e?.message); }

console.log('\n▶ Arbitrage…');
try { report.arbitrage = await runArbitrage(); console.log(JSON.stringify(report.arbitrage, null, 2)); }
catch (e) { console.error('❌ arbitrage:', e?.message); }

console.log('\n✅ DONE');
process.exit(0);
