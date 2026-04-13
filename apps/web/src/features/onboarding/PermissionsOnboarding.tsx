/**
 * PermissionsOnboarding — Écran de demande de permissions au premier lancement.
 *
 * Affiché une seule fois (stocké dans localStorage).
 * Uniquement sur app native (Capacitor Android/iOS).
 *
 * Demande dans l'ordre :
 * 1. Notifications (POST_NOTIFICATIONS)
 * 2. Microphone (RECORD_AUDIO)
 * 3. Caméra (CAMERA)
 * 4. Optimisation batterie (guide vers réglages)
 */
import { useState, useCallback, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { SK_PERMISSIONS_DONE } from "../../shared/constants/storage-keys";
import { useLocaleCurrency } from "../../app/providers/LocaleCurrencyProvider";
import "./permissions-onboarding.css";

type PermStep = "intro" | "notifications" | "microphone" | "camera" | "battery" | "done";
type PermStatus = "pending" | "granted" | "denied" | "skipped";

interface PermState {
  notifications: PermStatus;
  microphone: PermStatus;
  camera: PermStatus;
  battery: PermStatus;
}

export function PermissionsOnboarding({ onComplete }: { onComplete: () => void }) {
  const { t } = useLocaleCurrency();
  const [step, setStep] = useState<PermStep>("intro");
  const [perms, setPerms] = useState<PermState>({
    notifications: "pending",
    microphone: "pending",
    camera: "pending",
    battery: "pending",
  });

  const markDone = useCallback(() => {
    localStorage.setItem(SK_PERMISSIONS_DONE, Date.now().toString());
    onComplete();
  }, [onComplete]);

  // ── 1. Notifications ──
  const requestNotifications = useCallback(async () => {
    try {
      let result = await PushNotifications.checkPermissions();
      if (result.receive === "granted") {
        setPerms((p) => ({ ...p, notifications: "granted" }));
        setStep("microphone");
        return;
      }
      result = await PushNotifications.requestPermissions();
      const granted = result.receive === "granted";
      setPerms((p) => ({ ...p, notifications: granted ? "granted" : "denied" }));
      setStep("microphone");
    } catch {
      setPerms((p) => ({ ...p, notifications: "denied" }));
      setStep("microphone");
    }
  }, []);

  // ── 2. Microphone ──
  const requestMicrophone = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setPerms((p) => ({ ...p, microphone: "granted" }));
      setStep("camera");
    } catch {
      setPerms((p) => ({ ...p, microphone: "denied" }));
      setStep("camera");
    }
  }, []);

  // ── 3. Caméra ──
  const requestCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      setPerms((p) => ({ ...p, camera: "granted" }));
      setStep("battery");
    } catch {
      setPerms((p) => ({ ...p, camera: "denied" }));
      setStep("battery");
    }
  }, []);

  // ── 4. Batterie (ouvrir les réglages Android) ──
  const requestBattery = useCallback(async () => {
    try {
      // Sur Android, on ouvre les réglages d'optimisation batterie via un intent
      const { App: CapApp } = await import("@capacitor/app");
      // On ne peut pas ouvrir directement les réglages batterie depuis Capacitor,
      // mais on peut guider l'utilisateur. On marque comme "skipped" car
      // ça nécessite une action manuelle.
      setPerms((p) => ({ ...p, battery: "skipped" }));
      setStep("done");
    } catch {
      setPerms((p) => ({ ...p, battery: "skipped" }));
      setStep("done");
    }
  }, []);

  // ── Quand l'étape "done" est atteinte ──
  useEffect(() => {
    if (step === "done") {
      markDone();
    }
  }, [step, markDone]);

  // ── INTRO SCREEN ──
  if (step === "intro") {
    return (
      <div className="perm-onb">
        <div className="perm-onb-card">
          <div className="perm-onb-icon">📱</div>
          <h1 className="perm-onb-title">{t("perm.introTitle")}</h1>
          <p className="perm-onb-desc">{t("perm.introDesc")}</p>

          <div className="perm-onb-list">
            <div className="perm-onb-item">
              <span className="perm-onb-item-icon">🔔</span>
              <span>{t("perm.notifLabel")}</span>
            </div>
            <div className="perm-onb-item">
              <span className="perm-onb-item-icon">🎙️</span>
              <span>{t("perm.micLabel")}</span>
            </div>
            <div className="perm-onb-item">
              <span className="perm-onb-item-icon">📷</span>
              <span>{t("perm.camLabel")}</span>
            </div>
            <div className="perm-onb-item">
              <span className="perm-onb-item-icon">🔋</span>
              <span>{t("perm.battLabel")}</span>
            </div>
          </div>

          <button className="perm-onb-btn-primary" onClick={() => setStep("notifications")}>
            {t("perm.continue")}
          </button>
          <button className="perm-onb-btn-secondary" onClick={markDone}>
            {t("perm.later")}
          </button>
        </div>
      </div>
    );
  }

  // ── PERMISSION STEP ──
  const stepConfig: Record<string, {
    icon: string;
    titleKey: string;
    descKey: string;
    action: () => void;
    warnKey: string;
  }> = {
    notifications: {
      icon: "🔔",
      titleKey: "perm.notifTitle",
      descKey: "perm.notifDesc",
      action: () => void requestNotifications(),
      warnKey: "perm.notifWarn",
    },
    microphone: {
      icon: "🎙️",
      titleKey: "perm.micTitle",
      descKey: "perm.micDesc",
      action: () => void requestMicrophone(),
      warnKey: "perm.micWarn",
    },
    camera: {
      icon: "📷",
      titleKey: "perm.camTitle",
      descKey: "perm.camDesc",
      action: () => void requestCamera(),
      warnKey: "perm.camWarn",
    },
    battery: {
      icon: "🔋",
      titleKey: "perm.battTitle",
      descKey: "perm.battDesc",
      action: () => void requestBattery(),
      warnKey: "perm.battWarn",
    },
  };

  if (step === "done") return null;

  const cfg = stepConfig[step];
  if (!cfg) return null;

  const currentStatus = perms[step as keyof PermState];
  const showDenied = currentStatus === "denied";

  return (
    <div className="perm-onb">
      <div className="perm-onb-card">
        <div className="perm-onb-step-icon">{cfg.icon}</div>
        <h2 className="perm-onb-title">{t(cfg.titleKey)}</h2>
        <p className="perm-onb-desc">{t(cfg.descKey)}</p>

        {showDenied && (
          <div className="perm-onb-warn">
            <span>⚠️</span>
            <span>{t(cfg.warnKey)}</span>
          </div>
        )}

        <button className="perm-onb-btn-primary" onClick={cfg.action}>
          {showDenied ? t("perm.openSettings") : t("perm.authorize")}
        </button>

        <button
          className="perm-onb-btn-secondary"
          onClick={() => {
            setPerms((p) => ({ ...p, [step]: "skipped" }));
            const steps: PermStep[] = ["notifications", "microphone", "camera", "battery", "done"];
            const idx = steps.indexOf(step);
            setStep(steps[idx + 1]);
          }}
        >
          {t("perm.skip")}
        </button>

        {/* Progress dots */}
        <div className="perm-onb-dots">
          {(["notifications", "microphone", "camera", "battery"] as const).map((s) => (
            <div
              key={s}
              className={`perm-onb-dot ${s === step ? "active" : ""} ${
                perms[s] === "granted" ? "granted" : ""
              } ${perms[s] === "denied" ? "denied" : ""}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
