/**
 * Détection des erreurs de chargement dynamique (Vite/React lazy + chunks).
 *
 * Cas couverts (toutes plateformes/navigateurs) :
 *  - Vite dev :  "Failed to fetch dynamically imported module"
 *  - Vite prod : "Importing a module script failed"
 *  - Webpack-style : "Loading chunk X failed", "ChunkLoadError"
 *  - Safari : "Importing a module script failed"
 *  - Firefox : "error loading dynamically imported module"
 *
 * Ces erreurs proviennent quasi toujours :
 *  - d'une coupure réseau/connexion lente
 *  - d'un déploiement qui invalide les noms de chunks (hash) côté client encore ouvert
 *  - d'un service worker qui sert un index.html stale
 *
 * Réponse UX : message simple + bouton "Recharger".
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;

  // ChunkLoadError est parfois exposé par webpack/Vite via error.name
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name?: unknown }).name ?? "")
      : "";
  if (name === "ChunkLoadError") return true;

  let message = "";
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === "string") {
    message = error;
  } else if (typeof error === "object" && error !== null && "message" in error) {
    message = String((error as { message?: unknown }).message ?? "");
  }

  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("failed to fetch dynamically imported module") ||
    m.includes("importing a module script failed") ||
    m.includes("error loading dynamically imported module") ||
    m.includes("dynamically imported module") ||
    m.includes("loading chunk") ||
    m.includes("loading css chunk") ||
    m.includes("chunkloaderror")
  );
}
