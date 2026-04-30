/**
 * Seed Kin-Sell Analytique+ (market-intel)
 *
 * Crée la taxonomie des métiers (superset de 50, dérivé des 26 catégories
 * services + sous-spécialisations). Idempotent (upsert par slug).
 *
 * Usage :
 *   cd packages/db
 *   npx tsx prisma/seed-market-intel.ts
 *
 * Lancé automatiquement par le scheduler au démarrage de l'API si la table
 * MarketJob est vide.
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

type JobSeed = {
  slug: string;
  displayName: string;
  parentCategoryId: string;
  seniorityLevel: "junior" | "mid" | "senior";
};

// ─────────────────────────────────────────────────────────────────────────────
// 50 métiers (26 racines + 24 sous-spécialisations)
// Les parentCategoryId correspondent aux slugs de category-registry.ts
// (catégories services : driver, daycare, teacher, ... decoration)
// ─────────────────────────────────────────────────────────────────────────────
export const JOB_TAXONOMY: JobSeed[] = [
  // 1. Transport & Mobilité
  { slug: "driver-taxi", displayName: "Chauffeur taxi", parentCategoryId: "driver", seniorityLevel: "mid" },
  { slug: "driver-vtc", displayName: "Chauffeur VTC", parentCategoryId: "driver", seniorityLevel: "mid" },
  { slug: "driver-truck", displayName: "Chauffeur poids lourd", parentCategoryId: "driver", seniorityLevel: "senior" },
  { slug: "driver-motorcycle", displayName: "Conducteur moto-taxi", parentCategoryId: "driver", seniorityLevel: "junior" },

  // 2. Garde d'enfants & Enseignement
  { slug: "daycare-home", displayName: "Nounou à domicile", parentCategoryId: "daycare", seniorityLevel: "mid" },
  { slug: "daycare-center", displayName: "Auxiliaire crèche", parentCategoryId: "daycare", seniorityLevel: "junior" },
  { slug: "teacher-primary", displayName: "Enseignant primaire", parentCategoryId: "teacher", seniorityLevel: "mid" },
  { slug: "teacher-secondary", displayName: "Enseignant secondaire", parentCategoryId: "teacher", seniorityLevel: "senior" },
  { slug: "teacher-private-tutor", displayName: "Répétiteur (cours particuliers)", parentCategoryId: "teacher", seniorityLevel: "mid" },
  { slug: "teacher-language", displayName: "Professeur de langue", parentCategoryId: "teacher", seniorityLevel: "mid" },

  // 3. Santé
  { slug: "nurse-registered", displayName: "Infirmier diplômé d'État", parentCategoryId: "nurse", seniorityLevel: "senior" },
  { slug: "nurse-assistant", displayName: "Aide-soignant", parentCategoryId: "nurse", seniorityLevel: "mid" },
  { slug: "nurse-home-care", displayName: "Infirmier à domicile", parentCategoryId: "nurse", seniorityLevel: "senior" },

  // 4. Services domestiques
  { slug: "cleaner-residential", displayName: "Femme de ménage (domicile)", parentCategoryId: "cleaner", seniorityLevel: "mid" },
  { slug: "cleaner-office", displayName: "Agent d'entretien (bureaux)", parentCategoryId: "cleaner", seniorityLevel: "mid" },
  { slug: "cook-private", displayName: "Cuisinier à domicile", parentCategoryId: "cook", seniorityLevel: "mid" },
  { slug: "cook-restaurant", displayName: "Cuisinier de restaurant", parentCategoryId: "cook", seniorityLevel: "senior" },
  { slug: "maid-live-in", displayName: "Bonne à tout faire (logée)", parentCategoryId: "maid", seniorityLevel: "mid" },

  // 5. Sécurité
  { slug: "security-guard", displayName: "Gardien d'immeuble", parentCategoryId: "security", seniorityLevel: "mid" },
  { slug: "security-bodyguard", displayName: "Garde du corps", parentCategoryId: "security", seniorityLevel: "senior" },
  { slug: "security-night-watch", displayName: "Veilleur de nuit", parentCategoryId: "security", seniorityLevel: "junior" },

  // 6. Tech & Design
  { slug: "developer-fullstack", displayName: "Développeur full-stack", parentCategoryId: "developer", seniorityLevel: "senior" },
  { slug: "developer-mobile", displayName: "Développeur mobile (Android/iOS)", parentCategoryId: "developer", seniorityLevel: "senior" },
  { slug: "developer-backend", displayName: "Développeur back-end", parentCategoryId: "developer", seniorityLevel: "senior" },
  { slug: "developer-web-junior", displayName: "Intégrateur web junior", parentCategoryId: "developer", seniorityLevel: "junior" },
  { slug: "designer-graphic", displayName: "Designer graphique", parentCategoryId: "designer", seniorityLevel: "mid" },
  { slug: "designer-ui-ux", displayName: "Designer UI/UX", parentCategoryId: "designer", seniorityLevel: "senior" },
  { slug: "photographer-events", displayName: "Photographe événementiel", parentCategoryId: "photographer", seniorityLevel: "mid" },
  { slug: "photographer-studio", displayName: "Photographe studio/portrait", parentCategoryId: "photographer", seniorityLevel: "senior" },

  // 7. Bâtiment & Maintenance
  { slug: "plumber-residential", displayName: "Plombier résidentiel", parentCategoryId: "plumber", seniorityLevel: "mid" },
  { slug: "plumber-industrial", displayName: "Plombier industriel", parentCategoryId: "plumber", seniorityLevel: "senior" },
  { slug: "electrician-residential", displayName: "Électricien bâtiment", parentCategoryId: "electrician", seniorityLevel: "mid" },
  { slug: "electrician-industrial", displayName: "Électricien industriel", parentCategoryId: "electrician", seniorityLevel: "senior" },
  { slug: "electrician-solar", displayName: "Technicien solaire photovoltaïque", parentCategoryId: "electrician", seniorityLevel: "senior" },
  { slug: "mason-general", displayName: "Maçon généraliste", parentCategoryId: "mason", seniorityLevel: "mid" },
  { slug: "mason-finisher", displayName: "Maçon finisseur", parentCategoryId: "mason", seniorityLevel: "senior" },
  { slug: "repair-phone", displayName: "Réparateur téléphone", parentCategoryId: "repair", seniorityLevel: "mid" },
  { slug: "repair-computer", displayName: "Réparateur PC / Electronique", parentCategoryId: "repair", seniorityLevel: "mid" },

  // 8. Conseil & Marketing
  { slug: "consultant-business", displayName: "Consultant en gestion", parentCategoryId: "consultant", seniorityLevel: "senior" },
  { slug: "marketing-digital", displayName: "Chargé marketing digital", parentCategoryId: "marketing", seniorityLevel: "mid" },
  { slug: "marketing-social-media", displayName: "Community manager", parentCategoryId: "marketing", seniorityLevel: "junior" },
  { slug: "coach-fitness", displayName: "Coach sportif personnel", parentCategoryId: "coach", seniorityLevel: "mid" },

  // 9. Beauté & Mode
  { slug: "beauty-hairdresser", displayName: "Coiffeur / coiffeuse", parentCategoryId: "svc-beauty", seniorityLevel: "mid" },
  { slug: "beauty-makeup-artist", displayName: "Maquilleuse professionnelle", parentCategoryId: "svc-beauty", seniorityLevel: "senior" },
  { slug: "tailor-traditional", displayName: "Tailleur traditionnel", parentCategoryId: "tailor", seniorityLevel: "mid" },
  { slug: "tailor-fashion", displayName: "Couturier mode", parentCategoryId: "tailor", seniorityLevel: "senior" },

  // 10. Événementiel & Logistique
  { slug: "events-dj", displayName: "DJ / animateur événement", parentCategoryId: "events", seniorityLevel: "mid" },
  { slug: "delivery-motorbike", displayName: "Livreur moto", parentCategoryId: "delivery", seniorityLevel: "junior" },
  { slug: "gardening-residential", displayName: "Jardinier résidentiel", parentCategoryId: "gardening", seniorityLevel: "mid" },

  // 11. Administration & Finance
  { slug: "accounting-junior", displayName: "Comptable junior", parentCategoryId: "accounting", seniorityLevel: "junior" },
  { slug: "accounting-senior", displayName: "Expert-comptable", parentCategoryId: "accounting", seniorityLevel: "senior" },
];

// ─────────────────────────────────────────────────────────────────────────────
// 50 produits canoniques — couvrent les 22 catégories produits
// Servent d'ancres pour le matching (aggregator.ts)
// parentCategoryId = id de category-registry.ts (phone, it, appliances, …)
// ─────────────────────────────────────────────────────────────────────────────

type ProductSeed = {
  slug: string;
  displayName: string;
  categoryId: string;
  canonicalBrand?: string;
  attributes?: Prisma.InputJsonValue;
};

export const PRODUCT_TAXONOMY: ProductSeed[] = [
  // Téléphones (phone) — 6
  { slug: "smartphone-samsung-a16",      displayName: "Samsung Galaxy A16",           categoryId: "phone",       canonicalBrand: "Samsung", attributes: { storage: "128GB" } },
  { slug: "smartphone-samsung-a54",      displayName: "Samsung Galaxy A54",           categoryId: "phone",       canonicalBrand: "Samsung", attributes: { storage: "128GB" } },
  { slug: "smartphone-iphone-13",        displayName: "iPhone 13",                    categoryId: "phone",       canonicalBrand: "Apple",   attributes: { storage: "128GB" } },
  { slug: "smartphone-tecno-spark-20",   displayName: "Tecno Spark 20",               categoryId: "phone",       canonicalBrand: "Tecno" },
  { slug: "smartphone-infinix-hot-40",   displayName: "Infinix Hot 40",               categoryId: "phone",       canonicalBrand: "Infinix" },
  { slug: "smartphone-xiaomi-redmi-13",  displayName: "Xiaomi Redmi 13",              categoryId: "phone",       canonicalBrand: "Xiaomi" },

  // Informatique (it) — 4
  { slug: "laptop-hp-15",                displayName: "PC portable HP 15\" i5",       categoryId: "it",          canonicalBrand: "HP" },
  { slug: "laptop-dell-latitude",        displayName: "Dell Latitude 14\" i5",        categoryId: "it",          canonicalBrand: "Dell" },
  { slug: "laptop-macbook-air-m2",       displayName: "MacBook Air M2",               categoryId: "it",          canonicalBrand: "Apple" },
  { slug: "imprimante-hp-laserjet",      displayName: "Imprimante HP LaserJet",       categoryId: "it",          canonicalBrand: "HP" },

  // Électronique & TV (electronics) — 4
  { slug: "tv-samsung-55-4k",            displayName: "TV Samsung 55\" 4K",           categoryId: "electronics", canonicalBrand: "Samsung" },
  { slug: "tv-lg-43-4k",                 displayName: "TV LG 43\" 4K",                categoryId: "electronics", canonicalBrand: "LG" },
  { slug: "panneau-solaire-100w",        displayName: "Panneau solaire 100W",         categoryId: "electronics" },
  { slug: "batterie-oraimo-powerstation", displayName: "Oraimo Powerstation",         categoryId: "electronics", canonicalBrand: "Oraimo" },

  // Électroménager (appliances) — 6
  { slug: "frigo-samsung-300l",          displayName: "Frigo Samsung 300L",           categoryId: "appliances",  canonicalBrand: "Samsung" },
  { slug: "frigo-lg-250l",               displayName: "Frigo LG 250L",                categoryId: "appliances",  canonicalBrand: "LG" },
  { slug: "machine-laver-lg-7kg",        displayName: "Machine à laver LG 7kg",       categoryId: "appliances",  canonicalBrand: "LG" },
  { slug: "climatiseur-lg-12000btu",     displayName: "Climatiseur LG 12000 BTU",     categoryId: "appliances",  canonicalBrand: "LG" },
  { slug: "cuisiniere-gaz-4feux",        displayName: "Cuisinière gaz 4 feux",        categoryId: "appliances" },
  { slug: "ventilateur-brasseur",        displayName: "Ventilateur brasseur",         categoryId: "appliances" },

  // Alimentation (food) — 5
  { slug: "riz-parfume-25kg",            displayName: "Riz parfumé 25kg",             categoryId: "food" },
  { slug: "huile-tournesol-5l",          displayName: "Huile de tournesol 5L",        categoryId: "food" },
  { slug: "farine-ble-50kg",             displayName: "Farine de blé 50kg",           categoryId: "food" },
  { slug: "sucre-blanc-50kg",            displayName: "Sucre blanc 50kg",             categoryId: "food" },
  { slug: "lait-poudre-2-5kg",           displayName: "Lait en poudre 2,5kg",         categoryId: "food" },

  // Pharmacie (pharmacy) — 2
  { slug: "paracetamol-1g-boite",        displayName: "Paracétamol 1g (boîte)",       categoryId: "pharmacy" },
  { slug: "tensiometre-auto",            displayName: "Tensiomètre automatique",      categoryId: "pharmacy" },

  // Mode (clothes) — 3
  { slug: "jean-homme-denim",            displayName: "Jean homme denim",             categoryId: "clothes" },
  { slug: "robe-pagne-afro",             displayName: "Robe en pagne africain",       categoryId: "clothes" },
  { slug: "sneakers-nike-airforce",      displayName: "Nike Air Force 1",             categoryId: "clothes",     canonicalBrand: "Nike" },

  // Beauté (beauty) — 2
  { slug: "creme-nivea-hommes",          displayName: "Crème Nivea Men",              categoryId: "beauty",      canonicalBrand: "Nivea" },
  { slug: "parfum-axe-deo",              displayName: "Déodorant Axe",                categoryId: "beauty",      canonicalBrand: "Axe" },

  // Bébé (baby) — 2
  { slug: "couches-pampers-maxi",        displayName: "Couches Pampers Maxi (pack)",  categoryId: "baby",        canonicalBrand: "Pampers" },
  { slug: "biberon-avent-260ml",         displayName: "Biberon Avent 260ml",          categoryId: "baby",        canonicalBrand: "Avent" },

  // Maison / Mobilier (furniture) — 3
  { slug: "canape-3-places",             displayName: "Canapé 3 places",              categoryId: "furniture" },
  { slug: "matelas-140x190",             displayName: "Matelas 140x190",              categoryId: "furniture" },
  { slug: "table-salle-manger-6",        displayName: "Table salle à manger 6 pers.", categoryId: "furniture" },

  // Sports & Loisirs (sports) — 2
  { slug: "ballon-foot-adidas",          displayName: "Ballon foot Adidas",           categoryId: "sports",      canonicalBrand: "Adidas" },
  { slug: "velo-vtt-26",                 displayName: "VTT 26 pouces",                categoryId: "sports" },

  // Jeux vidéo (games) — 2
  { slug: "console-ps5",                 displayName: "PlayStation 5",                categoryId: "games",       canonicalBrand: "Sony" },
  { slug: "manette-xbox-series",         displayName: "Manette Xbox Series",          categoryId: "games",       canonicalBrand: "Microsoft" },

  // Livres (books) — 1
  { slug: "manuel-scolaire-college",     displayName: "Manuel scolaire collège",      categoryId: "books" },

  // Bricolage / Construction (diy) — 5
  { slug: "ciment-sac-50kg",             displayName: "Ciment sac 50kg",              categoryId: "diy" },
  { slug: "fer-beton-12mm-6m",           displayName: "Fer à béton 12mm (6m)",        categoryId: "diy" },
  { slug: "tole-ondulee-2m",             displayName: "Tôle ondulée 2m",              categoryId: "diy" },
  { slug: "peinture-murale-5l",          displayName: "Peinture murale 5L",           categoryId: "diy" },
  { slug: "groupe-electrogene-3kva",     displayName: "Groupe électrogène 3 kVA",     categoryId: "diy" },

  // Animalerie (pets) — 1
  { slug: "croquettes-chien-15kg",       displayName: "Croquettes chien 15kg",        categoryId: "pets" },

  // Auto / Mobilité — 3
  { slug: "scooter-125cc",               displayName: "Scooter 125cc",                categoryId: "auto" },
  { slug: "moto-haojue-125",             displayName: "Moto Haojue 125",              categoryId: "auto",        canonicalBrand: "Haojue" },
  { slug: "voiture-toyota-corolla",      displayName: "Toyota Corolla occasion",      categoryId: "auto",        canonicalBrand: "Toyota" },
];
async function main() {
  console.log(`[seed-market-intel] Seeding ${JOB_TAXONOMY.length} jobs + ${PRODUCT_TAXONOMY.length} products…`);

  let jobCreated = 0;
  let jobUpdated = 0;

  for (const job of JOB_TAXONOMY) {
    const before = await prisma.marketJob.findUnique({ where: { slug: job.slug } });
    await prisma.marketJob.upsert({
      where: { slug: job.slug },
      create: job,
      update: {
        displayName: job.displayName,
        parentCategoryId: job.parentCategoryId,
        seniorityLevel: job.seniorityLevel,
      },
    });
    if (before) jobUpdated++;
    else jobCreated++;
  }

  let prodCreated = 0;
  let prodUpdated = 0;

  for (const prod of PRODUCT_TAXONOMY) {
    const before = await prisma.marketProduct.findUnique({ where: { slug: prod.slug } });
    await prisma.marketProduct.upsert({
      where: { slug: prod.slug },
      create: {
        slug: prod.slug,
        displayName: prod.displayName,
        categoryId: prod.categoryId,
        canonicalBrand: prod.canonicalBrand,
        attributes: prod.attributes ?? undefined,
      },
      update: {
        displayName: prod.displayName,
        categoryId: prod.categoryId,
        canonicalBrand: prod.canonicalBrand ?? null,
        attributes: prod.attributes ?? undefined,
      },
    });
    if (before) prodUpdated++;
    else prodCreated++;
  }

  console.log(
    `[seed-market-intel] Done. Jobs: +${jobCreated} new, ~${jobUpdated} upd. Products: +${prodCreated} new, ~${prodUpdated} upd.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
