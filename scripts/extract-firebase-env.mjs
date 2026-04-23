#!/usr/bin/env node
/**
 * Extrait les 3 variables Firebase Admin SDK nécessaires depuis un
 * fichier JSON de compte de service Firebase, et les formate pour un `.env`.
 *
 * Usage :
 *   node scripts/extract-firebase-env.mjs <chemin/vers/serviceAccountKey.json>
 *
 * Exemple :
 *   node scripts/extract-firebase-env.mjs ./firebase-admin.json
 *
 * Sortie : 3 lignes prêtes à coller dans .env (locale ET sur le VPS)
 *   FIREBASE_PROJECT_ID=...
 *   FIREBASE_CLIENT_EMAIL=...
 *   FIREBASE_PRIVATE_KEY="..."
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const arg = process.argv[2];

if (!arg) {
  console.error("\n❌ Chemin manquant.\n");
  console.error("Usage :");
  console.error("  node scripts/extract-firebase-env.mjs <chemin/vers/serviceAccountKey.json>\n");
  console.error("Exemple :");
  console.error("  node scripts/extract-firebase-env.mjs C:\\Users\\filik\\Downloads\\kin-sell-firebase-adminsdk.json\n");
  process.exit(1);
}

const jsonPath = resolve(arg);

if (!existsSync(jsonPath)) {
  console.error(`\n❌ Fichier introuvable : ${jsonPath}\n`);
  process.exit(1);
}

let data;
try {
  const raw = readFileSync(jsonPath, "utf8");
  data = JSON.parse(raw);
} catch (err) {
  console.error(`\n❌ JSON invalide : ${err.message}\n`);
  process.exit(1);
}

const projectId = data.project_id;
const clientEmail = data.client_email;
const privateKey = data.private_key;

if (!projectId || !clientEmail || !privateKey) {
  console.error("\n❌ Le JSON ne semble pas être un compte de service Firebase (champs project_id / client_email / private_key manquants).\n");
  console.error("Télécharge-le depuis : Firebase Console → Paramètres ⚙ → Comptes de service → 'Générer une nouvelle clé privée'\n");
  process.exit(1);
}

// Les private_key du JSON contiennent de vrais \n. Pour un .env sur une seule
// ligne, on les encode en \\n (le backend fait .replace(/\\n/g, "\n") au boot).
const envPrivateKey = privateKey.replace(/\r/g, "").replace(/\n/g, "\\n");

console.log("\n✅ Valeurs extraites avec succès.\n");
console.log("─".repeat(70));
console.log("Colle les 3 lignes ci-dessous dans ton fichier `.env` (racine du projet)");
console.log("et aussi sur ton VPS (dans /etc/kin-sell/.env ou équivalent) :");
console.log("─".repeat(70));
console.log();
console.log(`FIREBASE_PROJECT_ID=${projectId}`);
console.log(`FIREBASE_CLIENT_EMAIL=${clientEmail}`);
console.log(`FIREBASE_PRIVATE_KEY="${envPrivateKey}"`);
console.log();
console.log("─".repeat(70));
console.log("⚠️  Garde ces valeurs secrètes — ne commit JAMAIS le JSON ou le .env");
console.log("    dans git. Vérifie que .env et *.json de Firebase sont dans .gitignore.");
console.log("─".repeat(70));
console.log();
console.log("Après avoir collé les valeurs :");
console.log("  1. Redémarre l'API locale : pnpm --filter @kinsell/api dev");
console.log("  2. Sur le VPS : pm2 restart kin-sell-api");
console.log("  3. Va dans Espace Privé → Paramètres → Notifications → Rafraîchir");
console.log("     Tu dois voir 'Compatible ✅' et aucun bandeau jaune.\n");
