# 🎨 KIN-SELL DESIGN SYSTEM v1.0

**Status**: ✅ LOCKED & DOCUMENTED  
**Date**: 26 mars 2026  
**Audience**: Développeurs, Designers, AI Assistants

---

## Table of Contents
1. [Vision](#vision)
2. [Palette](#palette)
3. [Architecture](#architecture)
4. [Components](#components)
5. [Animations](#animations)
6. [Responsive](#responsive)
7. [Lock Rules](#lock-rules)
8. [Implementation Guide](#implementation-guide)

---

## Vision

**Kin-Sell** est une plateforme **premium africaine** avec une identité visuelle moderne, sophistiquée et scalable.

### Design Principles
- **Glassmorphism**: Surfaces transparentes avec frosted glass effect
- **Premium Motion**: Animations subtiles mais captivantes
- **Dark-first**: Dark mode par défaut, light mode supporté
- **Africain**: Moderne, crédible, sans clichés
- **Scalable**: Variables centralisées, composants réutilisables

---

## Palette

### Color System (Verrouillé)

#### Primary Colors
| Name | Value | Usage |
|------|-------|-------|
| **Violet Primary** | `#6f58ff` | Accents, buttons, primary text |
| **Violet Hover** | `#b9a6ff` | Hover states, secondary text |
| **Prune Dark** | `#490c80` | 4ème accent, variations |

#### Background Colors
| Name | Value | RGB(A) |
|------|-------|--------|
| **Dark Blue Deep** | `#120b2b` | Primary background |
| **Dark Blue Light** | `#1e1240` | Secondary surface |
| **Dark Blue Lighter** | `#2b1b58` | Tertiary surface |

#### Glassmorphism
```css
/* Glass Surface */
background: rgba(35, 24, 72, 0.66); /* Glass backing */
border: 1px solid rgba(180, 160, 255, 0.24); /* Frosted edge */
backdrop-filter: blur(10px); /* Glass effect */
```

#### Text Colors
| Element | Color | Value |
|---------|-------|-------|
| Primary Text | White | `#ffffff` |
| Secondary Text | Lavender Gray | `#c7bedf` |
| Tertiary Text | Dark Lavender | `#9d92bb` |

#### Shadows
```css
--shadow-sm: 0 4px 12px rgba(16, 8, 34, 0.28);
--shadow-md: 0 8px 24px rgba(16, 8, 34, 0.36);
--shadow-lg: 0 12px 40px rgba(16, 8, 34, 0.45);
--shadow-glass: 0 8px 32px rgba(22, 12, 47, 0.5);
```

---

## Architecture

### File Structure
```
apps/web/src/
├── styles/
│   ├── design-tokens.css      ← MASTER TOKENS (🔒 LOCKED)
│   ├── glass-components.css   ← REUSABLE COMPONENTS (🔒 LOCKED)
│   ├── index.css              ← GLOBALS & ANIMATIONS (🔒 LOCKED)
│   ├── layout.css             ← PAGE LAYOUT & RESPONSIVE (🔒 LOCKED)
│   └── colors.css             ← SECONDARY PALETTE (🔒 LOCKED)
├── components/
│   ├── Header.tsx
│   ├── Footer.tsx
│   └── PageLayout.tsx
├── App.tsx                    ← THEME SHELLS & BUBBLES
└── ...
```

### CSS Variables Flow

```
design-tokens.css
    ↓ (defines)
    --color-primary: #6f58ff
    --glass-bg: rgba(35, 24, 72, 0.66)
    --font-size-lg: 18px
    ↓
glass-components.css
    ↓ (uses)
    background: var(--glass-bg)
    color: var(--color-primary)
    ↓
layout.css + index.css
    ↓ (inherits)
    .ks-header { background: transparent; border: 1px solid var(--glass-border); }
    .ks-footer { ... }
    ↓
Components (Header.tsx, Footer.tsx, etc.)
    ↓
Global Theme Applied ✅
```

---

## Components

### 1. Glass Container
```html
<div class="glass-container">
  <!-- Content hérite glassmorphism automatiquement -->
</div>
```

**Properties**:
- Background: `rgba(35, 24, 72, 0.66)`
- Border: `1px solid rgba(180, 160, 255, 0.24)`
- Backdrop: `blur(10px)`
- Hover: slightly lighter background

### 2. Glass Card
```html
<article class="glass-card">
  <h3>Titre</h3>
  <p>Contenu</p>
</article>
```

**Properties**:
- Flex column layout
- Padding: `var(--space-lg)`
- Hover: translateY(-4px), subtle shadow

### 3. Glass Button

#### Primary
```html
<button class="glass-button primary btn-md">Action</button>
```

#### Secondary
```html
<button class="glass-button secondary btn-md">Alternative</button>
```

**Sizes**: `btn-sm`, `btn-md`, `btn-lg`

---

## Animations

### Keyframes (Verrouillés)

#### 1. Bubble Drift
```css
@keyframes ksBubbleDrift {
  0% { transform: translate3d(0, 0) scale(1); }
  50% { transform: translate3d(24px, -20px) scale(1.04); }
  100% { transform: translate3d(-16px, 18px) scale(0.97); }
}
```

#### 2. Card Fade
```css
@keyframes ksCardFade {
  0% { opacity: 0; transform: translateY(20px); }
  100% { opacity: 1; transform: translateY(0); }
}
```

#### 3. Overlay Shift (subtle)
```css
@keyframes liveOverlayShift {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 0.6; }
}
```

### Timing Variables
```css
--transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
--transition-base: 300ms cubic-bezier(0.4, 0, 0.2, 1);
--transition-slow: 500ms cubic-bezier(0.4, 0, 0.2, 1);
```

### Background Bubbles

5 Animated spans en fixed position avec staggered delays:
```jsx
<div className="ks-theme-bubbles" aria-hidden="true">
  <span className="ks-bubble ks-bubble-1" />  /* delay: -2s */
  <span className="ks-bubble ks-bubble-2" />  /* delay: -6s */
  <span className="ks-bubble ks-bubble-3" />  /* delay: -10s */
  <span className="ks-bubble ks-bubble-4" />  /* delay: -14s */
  <span className="ks-bubble ks-bubble-5" />  /* delay: -18s */
</div>
```

---

## Responsive

### Breakpoints
```css
Mobile:  < 768px   (phones, small tablets)
Tablet:  768px → 1024px
Desktop: > 1024px
```

### Header Responsive
- **Desktop**: Navigation inline, burger hidden
- **Mobile**: Burger visible, nav hidden (`.ks-mobile-nav { display: none; }`)

### Footer Responsive
- **Desktop**: 3-column grid, full width
- **Tablet**: 2-column grid
- **Mobile**: 1-column stack

### Bubble Animations
- **Desktop**: Full opacity (0.34), blur(2px)
- **Mobile**: Reduced opacity (0.2), blur(1px) for performance

---

## Lock Rules

### 🔒 IMMUTABLE

These files MUST NOT be modified except for adding NEW tokens/components:

1. **design-tokens.css** — ALL color/spacing/typography variables
2. **glass-components.css** — `.glass-*` reusable components
3. **index.css** — Global animations, keyframes, bubbles
4. **layout.css** — Header/Footer/Page layout structure
5. **colors.css** — Secondary palette guard

### ✅ CAN MODIFY (with discretion)

- Add NEW CSS variables (e.g., `--color-custom: #xyz`)
- Add NEW component classes (e.g., `.glass-variant-premium`)
- Adjust responsive breakpoints for specific pages
- Create page-specific CSS (not affecting globals)

### ❌ NEVER

- Modify existing color values (#6f58ff, #120b2b, etc.)
- Remove or hide `.ks-theme-bubbles` or `.live-background-overlay`
- Change Header/Footer from transparent to opaque
- Remove glassmorphism effects (backdrop-filter, border)
- Hardcode colors instead of using `var(--color-*)`
- Change Footer border-radius from 20px
- Show mobile nav (`.ks-mobile-nav { display: flex; }`)
- Disable animations or keyframes

---

## Implementation Guide

### Creating a New Page (Following Design System)

#### 1. Import Styles
```tsx
// Page.tsx
import '../styles/design-tokens.css';  // Automatic
import './Page.css';  // Page-specific styles
```

#### 2. Use Theme Classes
```tsx
export function MyPage() {
  return (
    <div className="glass-container">
      <section className="glass-card">
        <h1>Titre</h1>
        <p>Contenu</p>
        <button className="glass-button primary btn-md">Action</button>
      </section>
    </div>
  );
}
```

#### 3. Custom Styling (if needed)
```css
/* MyPage.css */

.my-custom-section {
  background: transparent;  /* ✅ Use transparent */
  border: 1px solid var(--glass-border);  /* ✅ Use vars */
  padding: var(--space-lg);  /* ✅ Use spacing tokens */
  color: var(--color-text-primary);  /* ✅ Use text vars */
  transition: all var(--transition-base);  /* ✅ Use timing */
}

/* ❌ DON'T DO THIS: */
/* background: #120b2b;  <- Hardcoded! */
/* color: #6f58ff;  <- Hardcoded! */
/* padding: 24px;  <- Magic number! */
```

#### 4. Responsive Adjustments
```css
@media (max-width: 768px) {
  .my-custom-section {
    padding: var(--space-md);  /* Reduce padding on mobile */
  }
}
```

### Adding a New Component

#### Example: News Feed Card
```tsx
// components/NewsCard.tsx
import '../styles/design-tokens.css';

interface NewsCardProps {
  title: string;
  excerpt: string;
  date: string;
}

export function NewsCard({ title, excerpt, date }: NewsCardProps) {
  return (
    <article className="glass-card">
      <h3>{title}</h3>
      <p className="excerpt">{excerpt}</p>
      <footer className="meta">{date}</footer>
    </article>
  );
}
```

```css
/* NewsCard.css */

.meta {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
  margin-top: var(--space-md);
}

/* Uses inherited .glass-card styling ✅ */
```

---

## Q&A

### Q: Can I change the primary color?
**A**: ❌ No. The `#6f58ff` violet is part of the locked branding. If you need a slightly different shade, add a NEW variable:
```css
--color-accent-custom: #7f68ff;
```

### Q: Why is the mobile nav hidden?
**A**: The design shows header-only navigation on mobile. If you need to add it back:
✅ Request user approval first
✅ Ensure glassmorphism is maintained
✅ Document the change

### Q: Can I remove the bubbles?
**A**: ❌ No. The animated bubbles are core to the premium aesthetic. They define the "alive" feeling of the platform.

### Q: What if a page needs custom colors?
**A**: Create a NEW variable in that page's CSS:
```css
/* Page-specific */
:root {
  --color-custom-highlight: var(--color-accent-dark);  /* Reuse existing */
}
```

### Q: How do I extend the design system?
**A**: Add NEW tokens to `design-tokens.css`, never modify existing ones:
```css
/* ✅ GOOD: Add new */
--color-alert: #ff6b6b;
--spacing-custom: 64px;

/* ❌ BAD: Modify existing */
--color-primary: #7f68ff;  /* Changed from #6f58ff */
```

---

## Theme Switching (Prepared, Not Activated)

The system supports light mode via `data-theme="light"`. To activate:

```tsx
// ThemeProvider.tsx
export function ThemeProvider() {
  const [theme, setTheme] = useState('dark');
  
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {/* app */}
    </ThemeContext.Provider>
  );
}
```

Light palette already defined in `colors.css`:
```css
:root[data-theme="light"] {
  --color-dark-blue: #f5f7ff;
  --color-primary: #5d47d9;
  /* ... */
}
```

---

## Performance Notes

### Optimization Already Applied
- ✅ CSS variables (no runtime color calculations)
- ✅ Hardware-accelerated animations (transform3d, will-change)
- ✅ Reduced opacity/blur on mobile (performance consideration)
- ✅ Backdrop-filters optimized for 60fps
- ✅ Bubbles use `animation` not JavaScript

### Tips for Developers
1. Use CSS variables, not JS color calculations
2. Leverage `.glass-*` components (pre-optimized)
3. Test animations on low-end devices
4. Keep z-indexing organized (use fixed values from design)
5. Monitor blur effects—too many can impact performance

---

## Deployment Checklist

Before pushing to production:

- [ ] All color references use `var(--color-*)`
- [ ] Design-tokens.css unchanged (except NEW variables)
- [ ] Glass components inherited properly
- [ ] Font sizes use `var(--font-size-*)`
- [ ] Spacing uses `var(--space-*)`
- [ ] Animations running at 60fps
- [ ] No hardcoded colors (#6f58ff, #120b2b, etc.)
- [ ] Header transparent + glassmorphism intact
- [ ] Footer transparent + glassmorphism + border-radius 20px
- [ ] Mobile nav hidden
- [ ] Bubbles visible & animating
- [ ] Responsive tested (mobile, tablet, desktop)
- [ ] Light theme switches correctly (if enabled)

---

## References

- **Design System Source**: `/memories/repo/DESIGN-SYSTEM-LOCKED.md`
- **Product Vision**: `/docs/kin-sel-v2-blueprint.md`
- **Module 1 Spec**: `/docs/kin-sel-v2-module-1-spec.md`

---

**Last Updated**: 26 mars 2026  
**Version**: 1.0  
**Status**: 🔒 LOCKED

For questions or proposals to modify the design system, contact the product team.
