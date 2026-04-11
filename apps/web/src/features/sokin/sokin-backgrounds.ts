/**
 * Fonds prédéfinis pour les publications texte seul So-Kin
 * Styles: Glassmorphisme Kin-Sell + designs liquides modulaires
 * Inspirés de: Facebook, WhatsApp, Reddit, Instagram, Twitter
 */

export const SOKIN_POST_BACKGROUNDS = [
  // Gradients classiques Kin-Sell
  { id: 'gradient-violet', css: 'linear-gradient(135deg, #1c133b, #6f58ff)' },
  { id: 'gradient-ocean', css: 'linear-gradient(135deg, #0c2340, #23c4ff)' },
  { id: 'gradient-sunset', css: 'linear-gradient(135deg, #2b1649, #ff4d6a)' },
  { id: 'gradient-forest', css: 'linear-gradient(135deg, #0a2e1e, #31d0aa)' },
  { id: 'gradient-gold', css: 'linear-gradient(135deg, #2a1800, #f5b731)' },
  { id: 'gradient-midnight', css: 'linear-gradient(135deg, #000, #161616)' },
  
  // Glassmorphes liquides (Kin-Sell style)
  { id: 'glass-violet-liquid', css: 'linear-gradient(120deg, rgba(111, 88, 255, 0.35) 0%, rgba(18, 11, 43, 0.8) 50%, rgba(58, 25, 99, 0.4) 100%)' },
  { id: 'glass-blue-liquid', css: 'linear-gradient(110deg, rgba(0, 200, 255, 0.25) 0%, rgba(12, 35, 64, 0.85) 45%, rgba(35, 196, 255, 0.2) 100%)' },
  { id: 'glass-rose-liquid', css: 'linear-gradient(115deg, rgba(255, 77, 106, 0.25) 0%, rgba(43, 22, 73, 0.9) 50%, rgba(180, 50, 90, 0.3) 100%)' },
  
  // Texturés-liquides (style WhatsApp/Instagram Status)
  { id: 'texture-soft-blur', css: 'linear-gradient(180deg, rgba(111, 88, 255, 0.4) 0%, rgba(18, 11, 43, 0.95) 100%)', overlay: 'radial-gradient(circle at 30% 50%, rgba(255,255,255,0.05) 0%, transparent 50%)' },
  { id: 'texture-twilight', css: 'linear-gradient(135deg, #1a0d2e 0%, #3d2a5c 50%, #15132b 100%)', overlay: 'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(111, 88, 255, 0.08) 0%, transparent 60%)' },
  { id: 'texture-deep-abyss', css: 'linear-gradient(180deg, #0d0a1f 0%, #1a0d2e 50%, #0a081a 100%)', overlay: 'radial-gradient(circle at 60% 60%, rgba(58, 25, 99, 0.12) 0%, transparent 70%)' },
  
  // Liquides modernes (Reddit/Twitter inspiration)
  { id: 'liquid-cyan-mix', css: 'linear-gradient(105deg, #0a1f3a 0%, #1a3a52 30%, #0c2a4a 70%, #051428 100%)' },
  { id: 'liquid-magenta-fade', css: 'linear-gradient(125deg, #2a0a3a 0%, #1a0d28 40%, #3a1a4a 75%, #150d20 100%)' },
  { id: 'liquid-mint-dream', css: 'linear-gradient(120deg, #0a2e2e 0%, #1a4a4a 35%, #0d2a2a 100%)' },
  
  // Solides minimales (pour texte long)
  { id: 'solid-dark', css: '#120b2b' },
  { id: 'solid-charcoal', css: '#161616' },
  { id: 'solid-deep-purple', css: '#1a0d2e' },
] as const;

export const DEFAULT_BG_ID = 'gradient-violet';

export function resolveBackgroundCss(id?: string | null): string {
  const found = SOKIN_POST_BACKGROUNDS.find((b) => b.id === id);
  if (!found) return SOKIN_POST_BACKGROUNDS[0].css;
  
  // Si overlay existe, combiner (pour texturés)
  if ('overlay' in found && found.overlay) {
    return `${found.css}, ${found.overlay}`;
  }
  return found.css;
}
