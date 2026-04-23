/**
 * Lance un cycle complet Market Intel côté serveur (tous types crawl + aggregate + trends + arbitrage).
 * Usage: cd apps/api && node ../../scripts/run-market-intel-cycle.mjs
 */
process.env.ENABLE_MARKET_INTEL = 'true';
const { runCrawlCycle } = await import('./dist/modules/market-intel/orchestrator.js');
const { runAggregation } = await import('./dist/modules/market-intel/aggregator.js');
const { computeTrends } = await import('./dist/modules/market-intel/trends.js');
const { runArbitrage } = await import('./dist/modules/market-intel/arbitrage.js');

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
