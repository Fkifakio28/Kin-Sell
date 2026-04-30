import { RouterProvider } from "react-router-dom";
import { router } from "./app/router/router";
import { useAppUpdate } from "./hooks/useAppUpdate";
import { Modal } from "./components/overlay/Modal";

function AppUpdateModal() {
  const { showModal, update, openDownload, dismiss } = useAppUpdate();

  if (!showModal || !update) return null;

  return (
    <Modal
      isOpen
      onClose={dismiss}
      title="🔄 Mise à jour disponible"
      size="sm"
      persistent={update.forceUpdate}
      footer={
        <div style={{ display: "flex", gap: 10, width: "100%" }}>
          {!update.forceUpdate && (
            <button
              type="button"
              onClick={dismiss}
              style={{
                flex: 1,
                padding: "12px",
                border: "1px solid rgba(255,255,255,0.12)",
                background: "transparent",
                color: "rgba(255,255,255,0.6)",
                borderRadius: 12,
                fontSize: "0.9rem",
                cursor: "pointer",
              }}
            >
              Plus tard
            </button>
          )}
          <button
            type="button"
            onClick={() => void openDownload()}
            style={{
              flex: 2,
              padding: "12px",
              border: "none",
              background: "linear-gradient(135deg, #6f58ff, #a78bfa)",
              color: "#fff",
              borderRadius: 12,
              fontSize: "0.9rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Mettre à jour maintenant
          </button>
        </div>
      }
    >
      <div style={{ textAlign: "center", padding: "8px 0" }}>
        <p style={{ fontSize: "1rem", margin: "0 0 8px", color: "rgba(255,255,255,0.9)" }}>
          La version <strong>{update.version}</strong> est disponible.
        </p>
        {update.releaseNotes && (
          <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.55)", margin: "0 0 4px", whiteSpace: "pre-line" }}>
            {update.releaseNotes}
          </p>
        )}
        {update.forceUpdate && (
          <p style={{ fontSize: "0.82rem", color: "#f87171", marginTop: 8 }}>
            ⚠️ Cette mise à jour est obligatoire.
          </p>
        )}
      </div>
    </Modal>
  );
}

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <AppUpdateModal />
    </>
  );
}
