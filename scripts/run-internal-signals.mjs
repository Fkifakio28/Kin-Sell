import "dotenv/config";
import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../apps/api/.env") });

const { ingestKinSellInternalSignals, computeOrganicDemandSignals } = await import(
  "../apps/api/dist/modules/market-intel/internal-signals.js"
);

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
