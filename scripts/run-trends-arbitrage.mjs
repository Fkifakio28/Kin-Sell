/**
 * Compute trends + arbitrage from current DB state.
 * Usage: cd apps/api && node --env-file=.env ../../scripts/run-trends-arbitrage.mjs
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
process.env.ENABLE_MARKET_INTEL = 'true';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDist = path.resolve(__dirname, '..', 'apps/api/dist/modules/market-intel');
const load = (f) => import(pathToFileURL(path.join(apiDist, f)).href);

const { computeTrends } = await load('trends.js');
const { runArbitrage } = await load('arbitrage.js');

console.log('▶ computeTrends…');
const t = await computeTrends();
console.log(JSON.stringify(t, null, 2));

console.log('\n▶ runArbitrage…');
const a = await runArbitrage();
console.log(JSON.stringify(a, null, 2));

process.exit(0);
