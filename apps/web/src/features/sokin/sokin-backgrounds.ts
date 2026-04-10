/** Fonds prédéfinis pour les publications texte seul So-Kin */
export const SOKIN_POST_BACKGROUNDS = [
  { id: 'gradient-violet', css: 'linear-gradient(135deg, #1c133b, #6f58ff)' },
  { id: 'gradient-ocean', css: 'linear-gradient(135deg, #0c2340, #23c4ff)' },
  { id: 'gradient-sunset', css: 'linear-gradient(135deg, #2b1649, #ff4d6a)' },
  { id: 'gradient-forest', css: 'linear-gradient(135deg, #0a2e1e, #31d0aa)' },
  { id: 'gradient-gold', css: 'linear-gradient(135deg, #2a1800, #f5b731)' },
  { id: 'gradient-midnight', css: 'linear-gradient(135deg, #000, #161616)' },
  { id: 'solid-dark', css: '#120b2b' },
  { id: 'solid-charcoal', css: '#161616' },
] as const;

export const DEFAULT_BG_ID = 'gradient-violet';

export function resolveBackgroundCss(id?: string | null): string {
  const found = SOKIN_POST_BACKGROUNDS.find((b) => b.id === id);
  return found?.css ?? SOKIN_POST_BACKGROUNDS[0].css;
}
