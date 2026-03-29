# 🔒 KIN-SELL DESIGN SYSTEM — LOCKED

**Status**: ✅ Verrouillé (26 mars 2026)  
**Version**: 1.0

---

## ⚠️ Important

Le système de design Kin-Sell est **complètement verrouillé** pour garantir la cohérence visuelle sur toute la plateforme.

### 🎨 Palette
- **Primary Violet**: `#6f58ff`
- **Dark Blue**: `#120b2b`
- **Prune**: `#490c80`

### ✅ Caractéristiques
- Glassmorphism (backdrop-filter + frosted glass)
- Transparence (header & footer)
- Animations bulles (5 spans animées)
- Dark mode par défaut
- Responsive design

### 🚫 IMMUTABLE
- ❌ Modifier les couleurs
- ❌ Supprimer les animations
- ❌ Ajouter opacité au header/footer
- ❌ Afficher le menu mobile
- ❌ Hardcoder les valeurs hex

### ✅ ALLOWED
- ✅ Ajouter NEW tokens si nécessaire
- ✅ Créer page-specific CSS
- ✅ Ajouter NEW composants (hériter de glass-*)
- ✅ Responsive adjustments

---

## 📖 Documentation

1. **Full Guide**: [`docs/KIN-SELL-DESIGN-SYSTEM.md`](docs/KIN-SELL-DESIGN-SYSTEM.md)
2. **Locked Notes**: [`/memories/repo/DESIGN-SYSTEM-LOCKED.md`](MEMORY ONLY)
3. **User Preferences**: [`/memories/user-preferences.md`](MEMORY ONLY)

---

## 📁 Fichiers Critiques

| File | Status | Role |
|------|--------|------|
| `apps/web/src/styles/design-tokens.css` | 🔒 LOCKED | Master color/spacing/typography vars |
| `apps/web/src/styles/glass-components.css` | 🔒 LOCKED | Reusable component classes |
| `apps/web/src/styles/index.css` | 🔒 LOCKED | Global animations & bubbles |
| `apps/web/src/styles/layout.css` | 🔒 LOCKED | Header/Footer/Page structure |
| `apps/web/src/styles/colors.css` | 🔒 LOCKED | Secondary palette (guard) |

---

## 🚀 Using the System

### Import tokens automatically:
```tsx
import '../styles/design-tokens.css';
```

### Use components:
```html
<div class="glass-container">
  <article class="glass-card">
    <button class="glass-button primary">Action</button>
  </article>
</div>
```

### Custom CSS (right way):
```css
.my-section {
  background: transparent;
  border: 1px solid var(--glass-border);
  padding: var(--space-lg);
  color: var(--color-text-primary);
  transition: all var(--transition-base);
}
```

### Custom CSS (WRONG way):
```css
/* ❌ DON'T DO THIS */
.my-section {
  background: #120b2b;        /* Hardcoded! */
  color: #6f58ff;             /* Hardcoded! */
  padding: 24px;              /* Magic number! */
  transition: ease 0.3s;      /* Not from tokens! */
}
```

---

## ⚠️ Before Modifying

Ask yourself:
1. Is this a NEW feature/component? → Use existing tokens
2. Does it change existing design? → **STOP, read docs first**
3. Need custom color? → Add NEW var, don't modify existing ones
4. Modifying header/footer/bubbles? → **NO. Contact product team**

---

## 📞 Questions?

1. Read: [`docs/KIN-SELL-DESIGN-SYSTEM.md`](docs/KIN-SELL-DESIGN-SYSTEM.md)
2. Check: `/memories/repo/DESIGN-SYSTEM-LOCKED.md`
3. Verify: Compliance checklist in documentation
4. Ask: Product team before major changes

---

**Last Updated**: 26 mars 2026  
**Locked By**: GitHub Copilot  
**Status**: 🔒 IMMUTABLE (except NEW additions)

*This system ensures visual consistency across all pages. Do not bypass these guards.*
