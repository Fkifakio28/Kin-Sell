import { readFileSync } from 'fs';

function extractKeys(file) {
  const content = readFileSync(file, 'utf8');
  const keys = [];
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*"([^"]+)"\s*:/);
    if (m) keys.push(m[1]);
  }
  return keys;
}

const base = 'apps/web/src/app/i18n';
const frKeys = extractKeys(`${base}/fr.ts`);
const enKeys = extractKeys(`${base}/en.ts`);
const lnKeys = extractKeys(`${base}/ln.ts`);
const arKeys = extractKeys(`${base}/ar.ts`);

const enSet = new Set(enKeys);
const lnSet = new Set(lnKeys);
const arSet = new Set(arKeys);

const missingEn = frKeys.filter(k => !enSet.has(k));
const missingLn = frKeys.filter(k => !lnSet.has(k));
const missingAr = frKeys.filter(k => !arSet.has(k));

console.log(`=== MISSING EN (${missingEn.length}) ===`);
missingEn.forEach(k => console.log(k));
console.log(`\n=== MISSING LN (${missingLn.length}) ===`);
missingLn.forEach(k => console.log(k));
console.log(`\n=== MISSING AR (${missingAr.length}) ===`);
missingAr.forEach(k => console.log(k));
