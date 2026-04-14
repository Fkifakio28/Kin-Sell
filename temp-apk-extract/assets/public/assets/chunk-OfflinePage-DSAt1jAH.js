import{j as e}from"./index-Cq_upR72.js";import{r as t}from"./chunk-vendor-react-DRUrxFdQ.js";import"./chunk-vendor-socket-BcxXcwBL.js";function f(){const[n,i]=t.useState(navigator.onLine);return t.useEffect(()=>{const o=()=>i(!0),s=()=>i(!1);return window.addEventListener("online",o),window.addEventListener("offline",s),()=>{window.removeEventListener("online",o),window.removeEventListener("offline",s)}},[]),e.jsxs("div",{className:"ks-offline-page",children:[e.jsxs("div",{className:"ks-offline-card glass-card",children:[e.jsx("div",{className:"ks-offline-icon",children:n?"🌐":"📴"}),e.jsx("h1",{className:"ks-offline-title",children:n?"Page non disponible en cache":"Vous êtes hors ligne"}),e.jsx("p",{className:"ks-offline-body",children:n?"Revenez sur la page précédente ou allez à l'accueil.":"Vérifiez votre connexion Internet. Les pages déjà visitées restent accessibles en mode hors ligne."}),e.jsxs("div",{className:"ks-offline-actions",children:[e.jsx("button",{type:"button",className:"ks-offline-btn ks-offline-btn--primary",onClick:()=>window.location.href="/",children:"🏠 Retour à l'accueil"}),!n&&e.jsx("button",{type:"button",className:"ks-offline-btn ks-offline-btn--ghost",onClick:()=>window.location.reload(),children:"↺ Réessayer"})]})]}),e.jsx("style",{children:`
        .ks-offline-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .ks-offline-card {
          width: 100%;
          max-width: 460px;
          padding: 40px 32px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          text-align: center;
          border-radius: 20px;
        }
        .ks-offline-icon { font-size: 56px; line-height: 1; }
        .ks-offline-title {
          font-size: 1.4rem;
          font-weight: 700;
          color: var(--color-text-primary);
          margin: 0;
        }
        .ks-offline-body {
          font-size: 0.9rem;
          color: var(--color-text-secondary);
          line-height: 1.6;
          margin: 0;
        }
        .ks-offline-actions {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 100%;
        }
        .ks-offline-btn {
          width: 100%;
          padding: 12px 24px;
          border-radius: 12px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          border: none;
          transition: opacity 0.2s;
        }
        .ks-offline-btn--primary {
          background: var(--color-primary, #6f58ff);
          color: #fff;
        }
        .ks-offline-btn--primary:hover { opacity: 0.88; }
        .ks-offline-btn--ghost {
          background: transparent;
          color: var(--color-text-secondary);
          border: 1px solid var(--color-border, rgba(255,255,255,0.15));
        }
        .ks-offline-btn--ghost:hover { background: rgba(255,255,255,0.07); }
        @media (max-width: 480px) {
          .ks-offline-page { padding: 16px; }
          .ks-offline-card { padding: 24px 16px; }
          .ks-offline-icon { font-size: 40px; }
          .ks-offline-title { font-size: 1.2rem; }
        }
      `})]})}export{f as OfflinePage};
