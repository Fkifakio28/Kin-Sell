import { ingestKinSellInternalSignals, computeOrganicDemandSignals } from "../apps/api/dist/modules/market-intel/internal-signals.js";

const t0 = Date.now();
try {
  const ingest = await ingestKinSellInternalSignals();
  console.log("INGEST", JSON.stringify(ingest, null, 2));
  const organic = await computeOrganicDemandSignals();
  console.log("ORGANIC", JSON.stringify(organic, null, 2));
  console.log("DONE in", Date.now() - t0, "ms");
  process.exit(0);
} catch (err) {
  console.error(err);
  process.exit(1);
}
