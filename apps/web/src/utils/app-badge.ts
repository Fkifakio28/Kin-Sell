/**
 * App Badge API — met à jour le compteur sur l'icône PWA.
 * Fonctionne sur Android Chrome, Windows Edge/Chrome (installé en PWA).
 */
export function setAppBadge(count: number): void {
  if ("setAppBadge" in navigator) {
    if (count > 0) {
      (navigator as any).setAppBadge(count).catch(() => {});
    } else {
      (navigator as any).clearAppBadge().catch(() => {});
    }
  }
}

export function clearAppBadge(): void {
  if ("clearAppBadge" in navigator) {
    (navigator as any).clearAppBadge().catch(() => {});
  }
}
