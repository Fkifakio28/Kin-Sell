/**
 * Bloc Sécurité partagé : Email Verification + Phone + Sessions + ID + TOTP 2FA
 * Utilisé dans UserDashboard (settings) et BusinessDashboard (parametres).
 */
import { useState, useEffect } from "react";
import { auth as authApi } from "../../../lib/services/auth.service";
import type { AccountUser } from "../../../lib/api-core";

/* ── Types ── */
type TotpStep = "idle" | "setup" | "disable";
type EmailVerifStep = "idle" | "sent";
type FeedbackMsg = { type: "ok" | "err"; text: string } | null;

interface SecurityBlockProps {
  user: AccountUser;
  t: (key: string) => string;
}

export function DashboardSecurityBlock({ user, t }: SecurityBlockProps) {
  /* ── TOTP 2FA state ── */
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpSetupUri, setTotpSetupUri] = useState<string | null>(null);
  const [totpSetupSecret, setTotpSetupSecret] = useState<string | null>(null);
  const [totpSetupCode, setTotpSetupCode] = useState("");
  const [totpDisablePassword, setTotpDisablePassword] = useState("");
  const [totpStep, setTotpStep] = useState<TotpStep>("idle");
  const [totpBusy, setTotpBusy] = useState(false);
  const [totpMessage, setTotpMessage] = useState<FeedbackMsg>(null);
  const [totpQrDataUrl, setTotpQrDataUrl] = useState<string | null>(null);

  /* ── Email Verification state ── */
  const [emailVerifStep, setEmailVerifStep] = useState<EmailVerifStep>("idle");
  const [emailVerifId, setEmailVerifId] = useState("");
  const [emailVerifCode, setEmailVerifCode] = useState("");
  const [emailVerifBusy, setEmailVerifBusy] = useState(false);
  const [emailVerifMsg, setEmailVerifMsg] = useState<FeedbackMsg>(null);
  const [emailVerifDevCode, setEmailVerifDevCode] = useState<string | null>(null);

  /* ── Sessions ── */
  const [sessionsCount, setSessionsCount] = useState<number | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);

  /* ── Load on mount ── */
  useEffect(() => {
    void (async () => {
      try {
        const { totpEnabled: e } = await authApi.totpStatus();
        setTotpEnabled(e);
      } catch { /* ignore */ }
    })();
    void (async () => {
      setLoadingSessions(true);
      try {
        const { sessions } = await authApi.sessions();
        setSessionsCount(sessions.length);
      } catch { /* ignore */ }
      finally { setLoadingSessions(false); }
    })();
  }, []);

  /* ── TOTP handlers ── */
  async function handleTotpSetup() {
    setTotpBusy(true);
    setTotpMessage(null);
    try {
      const data = await authApi.totpSetup();
      setTotpSetupUri(data.uri);
      setTotpSetupSecret(data.secret);
      setTotpStep("setup");
      // Generate QR data URL
      try {
        const { default: QRCode } = await import("qrcode");
        const url = await QRCode.toDataURL(data.uri, { width: 220, margin: 2, color: { dark: "#ffffff", light: "#00000000" } });
        setTotpQrDataUrl(url);
      } catch { /* QR lib not available */ }
    } catch {
      setTotpMessage({ type: "err", text: "Erreur lors de la configuration 2FA" });
    } finally { setTotpBusy(false); }
  }

  async function handleTotpEnable() {
    setTotpBusy(true);
    setTotpMessage(null);
    try {
      await authApi.totpEnable(totpSetupCode);
      setTotpEnabled(true);
      setTotpStep("idle");
      setTotpSetupUri(null);
      setTotpSetupSecret(null);
      setTotpQrDataUrl(null);
      setTotpSetupCode("");
      setTotpMessage({ type: "ok", text: t("user.settings2faEnabledMsg") });
    } catch {
      setTotpMessage({ type: "err", text: t("user.settings2faWrongCode") });
    } finally { setTotpBusy(false); }
  }

  async function handleTotpDisable() {
    setTotpBusy(true);
    setTotpMessage(null);
    try {
      await authApi.totpDisable(totpDisablePassword);
      setTotpEnabled(false);
      setTotpStep("idle");
      setTotpDisablePassword("");
      setTotpMessage({ type: "ok", text: t("user.settings2faDisabledMsg") });
    } catch {
      setTotpMessage({ type: "err", text: t("user.settings2faWrongPassword") });
    } finally { setTotpBusy(false); }
  }

  /* ── Email Verification handlers ── */
  async function handleSendEmailVerification() {
    if (!user.email) return;
    setEmailVerifBusy(true);
    setEmailVerifMsg(null);
    try {
      const res = await authApi.requestEmailVerification(user.email);
      setEmailVerifId(res.verificationId);
      setEmailVerifStep("sent");
      if (res.previewCode) setEmailVerifDevCode(res.previewCode);
    } catch {
      setEmailVerifMsg({ type: "err", text: "Erreur d'envoi" });
    } finally { setEmailVerifBusy(false); }
  }

  async function handleConfirmEmailVerification() {
    setEmailVerifBusy(true);
    setEmailVerifMsg(null);
    try {
      await authApi.confirmEmailVerification({ verificationId: emailVerifId, code: emailVerifCode });
      setEmailVerifStep("idle");
      setEmailVerifCode("");
      setEmailVerifMsg({ type: "ok", text: "Email vérifié ✅" });
      setEmailVerifDevCode(null);
    } catch {
      setEmailVerifMsg({ type: "err", text: "Code invalide" });
    } finally { setEmailVerifBusy(false); }
  }

  return (
    <>
      {/* Email Verification */}
      <div className="ud-settings-security-item">
        <div className="ud-settings-security-info">
          <strong>{t("user.settingsEmailVerified")}</strong>
          <span className={user.emailVerified ? "ud-settings-verified" : "ud-settings-unverified"}>
            {user.emailVerified ? `✅ ${t("user.settingsYes")}` : `❌ ${t("user.settingsNo")}`}
          </span>
        </div>
        {!user.emailVerified && user.email && emailVerifStep === "idle" && (
          <button type="button" className="ud-quick-btn ud-quick-btn--primary" style={{ marginTop: 6, fontSize: "0.82rem" }} onClick={() => void handleSendEmailVerification()} disabled={emailVerifBusy}>
            {emailVerifBusy ? "..." : "📧 Vérifier mon email"}
          </button>
        )}
        {emailVerifStep === "sent" && (
          <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <input type="text" inputMode="numeric" maxLength={6} placeholder="000000" value={emailVerifCode}
              onChange={(e) => setEmailVerifCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              style={{ width: 100, padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "var(--ud-text-1)", fontFamily: "monospace", fontSize: "1rem", textAlign: "center" }}
            />
            <button type="button" className="ud-quick-btn ud-quick-btn--primary" style={{ fontSize: "0.82rem" }} onClick={() => void handleConfirmEmailVerification()} disabled={emailVerifBusy || emailVerifCode.length !== 6}>
              {emailVerifBusy ? "..." : "✓ Confirmer"}
            </button>
            <button type="button" className="ud-quick-btn" style={{ fontSize: "0.82rem" }} onClick={() => { setEmailVerifStep("idle"); setEmailVerifCode(""); setEmailVerifMsg(null); }}>
              Annuler
            </button>
          </div>
        )}
        {emailVerifDevCode && <p style={{ fontSize: "0.75rem", color: "#a78bfa", margin: "4px 0 0" }}>[DEV] Code : {emailVerifDevCode}</p>}
        {emailVerifMsg && <p style={{ fontSize: "0.8rem", marginTop: 4, color: emailVerifMsg.type === "ok" ? "#7ef5c4" : "#ff6b6b" }}>{emailVerifMsg.text}</p>}
      </div>

      {/* Phone Verified */}
      <div className="ud-settings-security-item">
        <div className="ud-settings-security-info">
          <strong>{t("user.settingsPhoneVerified")}</strong>
          <span className={user.phoneVerified ? "ud-settings-verified" : "ud-settings-unverified"}>
            {user.phoneVerified ? `✅ ${t("user.settingsYes")}` : `❌ ${t("user.settingsNo")}`}
          </span>
        </div>
      </div>

      {/* Active Sessions */}
      <div className="ud-settings-security-item">
        <div className="ud-settings-security-info">
          <strong>{t("user.settingsActiveSessions")}</strong>
          <span style={{ color: "var(--ud-text-2)" }}>{loadingSessions ? "..." : (sessionsCount ?? "—")}</span>
        </div>
      </div>

      {/* Kin-Sell ID */}
      <div className="ud-settings-security-item">
        <div className="ud-settings-security-info">
          <strong>ID Kin-Sell</strong>
          <span style={{ color: "var(--ud-text-2)", fontFamily: "monospace", fontSize: "0.78rem" }}>{user.id.slice(0, 12)}…</span>
        </div>
      </div>

      {/* TOTP 2FA */}
      <div className="ud-settings-security-item ud-settings-security-item--full">
        <div className="ud-settings-security-info">
          <strong>{t("user.settings2faTitle")}</strong>
          <span className={totpEnabled ? "ud-settings-verified" : "ud-settings-unverified"}>
            {totpEnabled ? `✅ ${t("user.settings2faEnabled")}` : `❌ ${t("user.settings2faDisabled")}`}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {!totpEnabled && totpStep === "idle" && (
            <button type="button" className="ud-quick-btn ud-quick-btn--primary" onClick={() => void handleTotpSetup()} disabled={totpBusy}>
              {totpBusy ? "..." : `🔐 ${t("user.settings2faSetupBtn")}`}
            </button>
          )}
          {totpEnabled && totpStep === "idle" && (
            <button type="button" className="ud-quick-btn" style={{ color: "var(--color-error, #ff6b6b)" }} onClick={() => { setTotpStep("disable"); setTotpMessage(null); }} disabled={totpBusy}>
              🔓 {t("user.settings2faDisableBtn")}
            </button>
          )}
        </div>

        {/* Step: scan QR + saisie code */}
        {totpStep === "setup" && (
          <div style={{ marginTop: 16, padding: 16, background: "rgba(111,88,255,0.08)", borderRadius: 12, border: "1px solid rgba(111,88,255,0.2)" }}>
            <p style={{ margin: "0 0 12px", fontSize: "0.88rem", color: "var(--ud-text-2)" }}>{t("user.settings2faScanPrompt")}</p>
            {totpQrDataUrl && <img src={totpQrDataUrl} alt="QR code 2FA" style={{ display: "block", margin: "0 auto 12px", borderRadius: 8 }} />}
            {totpSetupSecret && (
              <div style={{ margin: "0 0 12px", padding: "10px 14px", background: "rgba(255,255,255,0.06)", borderRadius: 8, border: "1px dashed rgba(255,255,255,0.2)", textAlign: "center" }}>
                <p style={{ margin: "0 0 4px", fontSize: "0.78rem", color: "var(--ud-text-2)" }}>Clé manuelle (si le QR ne fonctionne pas) :</p>
                <code style={{ fontSize: "0.95rem", letterSpacing: "0.15em", color: "#a78bfa", fontWeight: 600, wordBreak: "break-all", userSelect: "all" }}>{totpSetupSecret}</code>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="text" inputMode="numeric" maxLength={6}
                placeholder="000000"
                value={totpSetupCode}
                onChange={(e) => setTotpSetupCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                style={{ flex: 1, minWidth: 100, padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "var(--ud-text-1)", fontFamily: "monospace", fontSize: "1.2rem", textAlign: "center", letterSpacing: "0.2em" }}
              />
              <button type="button" className="ud-quick-btn ud-quick-btn--primary" onClick={() => void handleTotpEnable()} disabled={totpBusy || totpSetupCode.length !== 6}>
                {totpBusy ? "..." : `✓ ${t("user.settings2faActivate")}`}
              </button>
              <button type="button" className="ud-quick-btn" onClick={() => { setTotpStep("idle"); setTotpSetupUri(null); setTotpSetupSecret(null); setTotpQrDataUrl(null); setTotpSetupCode(""); setTotpMessage(null); }}>
                {t("user.cancelLabel")}
              </button>
            </div>
          </div>
        )}

        {/* Step: désactiver avec mot de passe */}
        {totpStep === "disable" && (
          <div style={{ marginTop: 16, padding: 16, background: "rgba(255,107,107,0.08)", borderRadius: 12, border: "1px solid rgba(255,107,107,0.2)" }}>
            <p style={{ margin: "0 0 12px", fontSize: "0.88rem", color: "var(--ud-text-2)" }}>{t("user.settings2faDisablePrompt")}</p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="password" placeholder={t("user.settings2faPasswordPlaceholder")}
                value={totpDisablePassword}
                onChange={(e) => setTotpDisablePassword(e.target.value)}
                style={{ flex: 1, minWidth: 160, padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "var(--ud-text-1)" }}
              />
              <button type="button" className="ud-quick-btn" style={{ color: "var(--color-error, #ff6b6b)" }} onClick={() => void handleTotpDisable()} disabled={totpBusy}>
                {totpBusy ? "..." : t("user.settings2faConfirmBtn")}
              </button>
              <button type="button" className="ud-quick-btn" onClick={() => { setTotpStep("idle"); setTotpDisablePassword(""); setTotpMessage(null); }}>
                {t("user.cancelLabel")}
              </button>
            </div>
          </div>
        )}

        {totpMessage && (
          <p style={{ marginTop: 8, fontSize: "0.85rem", color: totpMessage.type === "ok" ? "#7ef5c4" : "#ff6b6b" }}>{totpMessage.text}</p>
        )}
      </div>
    </>
  );
}
