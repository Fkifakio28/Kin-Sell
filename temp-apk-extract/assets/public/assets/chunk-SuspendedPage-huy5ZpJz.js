import{c as b,u as k,j as e,h as f}from"./index-Cq_upR72.js";import{b as y,r as t}from"./chunk-vendor-react-DRUrxFdQ.js";import"./chunk-vendor-socket-BcxXcwBL.js";function z(){const{user:a,logout:u}=b(),{t:s}=k(),x=y(),[r,d]=t.useState("info"),[n,h]=t.useState(""),[o,p]=t.useState(!1),[l,i]=t.useState(null),m=async()=>{if(n.trim().length<10){i(s("auth.appealMinChars"));return}p(!0),i(null);try{await f.submitAppeal(n.trim()),d("appeal-sent")}catch{i(s("auth.appealError"))}finally{p(!1)}},c=async()=>{await u(),x("/login")};return e.jsxs("div",{className:"ks-suspended-page",children:[e.jsxs("div",{className:"ks-suspended-card glass-card",children:[e.jsx("div",{className:"ks-suspended-icon",children:"🚫"}),r==="info"&&e.jsxs(e.Fragment,{children:[e.jsx("h1",{className:"ks-suspended-title",children:s("auth.suspendedTitle")}),e.jsx("p",{className:"ks-suspended-body",children:s("auth.suspendedBody")}),a?.suspensionReason&&e.jsxs("div",{className:"ks-suspended-reason",children:[e.jsx("span",{className:"ks-suspended-reason-label",children:s("auth.suspensionReason")}),e.jsx("span",{className:"ks-suspended-reason-text",children:a.suspensionReason})]}),a?.suspensionExpiresAt&&e.jsxs("div",{className:"ks-suspended-expires",children:[e.jsx("span",{className:"ks-suspended-expires-label",children:"⏳ Durée de la suspension"}),e.jsxs("span",{className:"ks-suspended-expires-text",children:["Votre compte sera réactivé le ",new Date(a.suspensionExpiresAt).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"})]})]}),!a?.suspensionExpiresAt&&a?.accountStatus==="SUSPENDED"&&e.jsxs("div",{className:"ks-suspended-expires",children:[e.jsx("span",{className:"ks-suspended-expires-label",children:"⚠️ Suspension permanente"}),e.jsx("span",{className:"ks-suspended-expires-text",children:"Votre compte est suspendu indéfiniment. Vous pouvez faire appel ci-dessous."})]}),e.jsx("p",{className:"ks-suspended-help",children:s("auth.suspendedHelp")}),e.jsxs("div",{className:"ks-suspended-actions",children:[e.jsxs("button",{type:"button",className:"ks-btn ks-btn--primary",onClick:()=>d("appeal"),children:["✉️ ",s("auth.submitAppeal")]}),e.jsx("button",{type:"button",className:"ks-btn ks-btn--ghost",onClick:c,children:s("auth.backToLogin")})]})]}),r==="appeal"&&e.jsxs(e.Fragment,{children:[e.jsx("h1",{className:"ks-suspended-title",children:s("auth.appealTitle")}),e.jsx("p",{className:"ks-suspended-body",children:s("auth.appealBody")}),e.jsx("textarea",{className:"ks-suspended-textarea",placeholder:s("auth.appealPlaceholder"),value:n,onChange:g=>h(g.target.value),rows:6,maxLength:2e3}),e.jsxs("div",{className:"ks-suspended-char-count",children:[n.length," / 2000"]}),l&&e.jsx("div",{className:"ks-suspended-error",children:l}),e.jsxs("div",{className:"ks-suspended-actions",children:[e.jsx("button",{type:"button",className:"ks-btn ks-btn--primary",onClick:m,disabled:o,children:s(o?"auth.appealSending":"auth.appealSend")}),e.jsxs("button",{type:"button",className:"ks-btn ks-btn--ghost",onClick:()=>d("info"),disabled:o,children:["← ",s("common.back")]})]})]}),r==="appeal-sent"&&e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"ks-suspended-icon",style:{fontSize:48},children:"✅"}),e.jsx("h1",{className:"ks-suspended-title",children:s("auth.appealSentTitle")}),e.jsx("p",{className:"ks-suspended-body",children:s("auth.appealSentBody")}),e.jsx("div",{className:"ks-suspended-actions",children:e.jsx("button",{type:"button",className:"ks-btn ks-btn--ghost",onClick:c,children:s("auth.backToLogin")})})]})]}),e.jsx("style",{children:`
        .ks-suspended-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .ks-suspended-card {
          width: 100%;
          max-width: 520px;
          padding: 40px 32px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          text-align: center;
          border-radius: 20px;
        }
        .ks-suspended-icon {
          font-size: 56px;
          line-height: 1;
        }
        .ks-suspended-title {
          font-size: 1.6rem;
          font-weight: 700;
          color: var(--color-text-primary);
          margin: 0;
        }
        .ks-suspended-body {
          font-size: 0.95rem;
          color: var(--color-text-secondary);
          line-height: 1.6;
          margin: 0;
        }
        .ks-suspended-reason {
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 12px;
          padding: 12px 16px;
          width: 100%;
          text-align: left;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .ks-suspended-reason-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: #ef4444;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .ks-suspended-reason-text {
          font-size: 0.9rem;
          color: var(--color-text-primary);
        }
        .ks-suspended-expires {
          background: rgba(234, 179, 8, 0.12);
          border: 1px solid rgba(234, 179, 8, 0.3);
          border-radius: 12px;
          padding: 12px 16px;
          width: 100%;
          text-align: left;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .ks-suspended-expires-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: #eab308;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .ks-suspended-expires-text {
          font-size: 0.9rem;
          color: var(--color-text-primary);
        }
        .ks-suspended-help {
          font-size: 0.875rem;
          color: var(--color-text-muted, var(--color-text-secondary));
          line-height: 1.6;
          margin: 0;
        }
        .ks-suspended-actions {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 100%;
        }
        .ks-btn {
          width: 100%;
          padding: 12px 24px;
          border-radius: 12px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          border: none;
          transition: opacity 0.2s, transform 0.1s;
        }
        .ks-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .ks-btn--primary {
          background: var(--color-primary, #6f58ff);
          color: #fff;
        }
        .ks-btn--primary:not(:disabled):hover { opacity: 0.88; }
        .ks-btn--ghost {
          background: transparent;
          color: var(--color-text-secondary);
          border: 1px solid var(--color-border, rgba(255,255,255,0.15));
        }
        .ks-btn--ghost:hover { background: rgba(255,255,255,0.07); }
        .ks-suspended-textarea {
          width: 100%;
          padding: 12px 14px;
          border-radius: 10px;
          background: rgba(255,255,255,0.07);
          border: 1px solid var(--color-border, rgba(255,255,255,0.15));
          color: var(--color-text-primary);
          font-size: 0.9rem;
          line-height: 1.5;
          resize: vertical;
          box-sizing: border-box;
        }
        .ks-suspended-textarea:focus {
          outline: none;
          border-color: var(--color-primary, #6f58ff);
        }
        .ks-suspended-char-count {
          font-size: 0.75rem;
          color: var(--color-text-secondary);
          align-self: flex-end;
          margin-top: -8px;
        }
        .ks-suspended-error {
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 8px;
          padding: 10px 14px;
          font-size: 0.875rem;
          color: #ef4444;
          width: 100%;
          text-align: left;
        }
        @media (max-width: 480px) {
          .ks-suspended-page { padding: 16px; }
          .ks-suspended-card { padding: 24px 16px; }
          .ks-suspended-icon { font-size: 40px; }
          .ks-suspended-title { font-size: 1.3rem; }
          .ks-suspended-body { font-size: 0.88rem; }
        }
      `})]})}export{z as SuspendedPage};
