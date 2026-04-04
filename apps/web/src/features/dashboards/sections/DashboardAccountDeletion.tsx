/**
 * Bloc Suppression de compte partagé — 4 steps : idle → confirm → reason → done
 * Utilisé dans UserDashboard et BusinessDashboard.
 */
import { useState } from "react";
import { auth as authApi } from "../../../lib/services/auth.service";

interface AccountDeletionProps {
  t: (key: string) => string;
}

export function DashboardAccountDeletion({ t }: AccountDeletionProps) {
  const [deleteStep, setDeleteStep] = useState<"idle" | "confirm" | "reason" | "done">("idle");
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  return (
    <section className="ud-glass-panel ud-settings-section ud-settings-danger">
      <div className="ud-settings-section-head">
        <span className="ud-settings-section-icon">⚠️</span>
        <h3 className="ud-settings-section-title">{t("user.settingsDangerTitle")}</h3>
      </div>

      {deleteStep === "idle" && (
        <>
          <p className="ud-placeholder-text" style={{ margin: "0 0 12px", fontSize: "0.84rem" }}>
            {t("user.settingsDangerDesc")}
          </p>
          <button type="button" className="ud-quick-btn ud-settings-delete-btn" onClick={() => setDeleteStep("confirm")}>
            🗑️ {t("user.settingsDeleteBtn")}
          </button>
        </>
      )}

      {deleteStep === "confirm" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p className="ud-placeholder-text" style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600 }}>
            {t("user.settingsDeleteConfirmQ")}
          </p>
          <p className="ud-placeholder-text" style={{ margin: 0, fontSize: "0.84rem" }}>
            {t("user.settingsDeleteConfirmDesc")}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="ud-quick-btn ud-settings-delete-btn" onClick={() => setDeleteStep("reason")}>
              {t("user.settingsDeleteContinue")}
            </button>
            <button type="button" className="ud-quick-btn" onClick={() => setDeleteStep("idle")}>
              {t("user.cancelLabel")}
            </button>
          </div>
        </div>
      )}

      {deleteStep === "reason" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p className="ud-placeholder-text" style={{ margin: 0, fontSize: "0.84rem" }}>
            {t("user.settingsDeleteReasonPrompt")}
          </p>
          <textarea
            className="ud-input"
            placeholder={t("user.settingsDeleteReasonPlaceholder")}
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            rows={3}
            maxLength={1000}
            style={{ resize: "vertical" }}
          />
          {deleteError && (
            <p style={{ margin: 0, fontSize: "0.83rem", color: "var(--color-error, #ff6b6b)" }}>{deleteError}</p>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="ud-quick-btn ud-settings-delete-btn"
              disabled={deleteBusy}
              onClick={async () => {
                setDeleteBusy(true);
                setDeleteError(null);
                try {
                  await authApi.requestDeletion(deleteReason.trim() || t("user.settingsDeleteNoReason"));
                  setDeleteStep("done");
                } catch {
                  setDeleteError(t("user.settingsDeleteError"));
                } finally {
                  setDeleteBusy(false);
                }
              }}
            >
              {deleteBusy ? "..." : t("user.settingsDeleteConfirm2")}
            </button>
            <button
              type="button"
              className="ud-quick-btn"
              disabled={deleteBusy}
              onClick={() => { setDeleteStep("idle"); setDeleteReason(""); setDeleteError(null); }}
            >
              {t("user.cancelLabel")}
            </button>
          </div>
        </div>
      )}

      {deleteStep === "done" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p className="ud-placeholder-text" style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600 }}>
            ✅ {t("user.settingsDeleteDoneTitle")}
          </p>
          <p className="ud-placeholder-text" style={{ margin: 0, fontSize: "0.84rem" }}>
            {t("user.settingsDeleteDoneInfo")}
          </p>
        </div>
      )}
    </section>
  );
}
