import { useCallback, useEffect, useState } from 'react';
import {
  getNotificationPermission,
  isPushSupported,
  isNativeApp,
  isSubscribedToPush,
  subscribeToPush,
  unsubscribeFromPush,
} from '../../../utils/push-notifications';
import { request as apiRequest } from '../../../lib/api-core';

// ══════════════════════════════════════════════
// DASHBOARD NOTIFICATIONS SECTION
// Permet à l'utilisateur de voir l'état des notifs
// et de les activer/tester sur ce device.
// ══════════════════════════════════════════════

type Diagnostic = {
  server: { vapidConfigured: boolean; fcmConfigured: boolean };
  user: { webSubscriptions: number; fcmTokens: number };
};

type Platform = 'native' | 'ios-pwa' | 'ios-safari' | 'chrome-android' | 'desktop' | 'unknown';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return 'unknown';
  if (isNativeApp()) return 'native';
  const ua = navigator.userAgent.toLowerCase();
  const isStandalone =
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    (navigator as any).standalone === true;
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);
  if (isIOS) return isStandalone ? 'ios-pwa' : 'ios-safari';
  if (isAndroid) return 'chrome-android';
  return 'desktop';
}

const PLATFORM_INFO: Record<Platform, { label: string; hint: string }> = {
  native: { label: 'Application Kin-Sell (Android)', hint: 'Notifications FCM natives via Firebase.' },
  'ios-pwa': { label: 'iOS — PWA installée', hint: 'Les notifications web fonctionnent depuis iOS 16.4+.' },
  'ios-safari': {
    label: 'iOS — Safari',
    hint: "Pour recevoir les notifications hors-site sur iPhone/iPad, ajoutez Kin-Sell à l'écran d'accueil (Partager → Sur l'écran d'accueil), puis ouvrez l'icône.",
  },
  'chrome-android': { label: 'Android — Navigateur', hint: 'Les notifications Web Push fonctionnent.' },
  desktop: { label: 'Navigateur de bureau', hint: 'Les notifications Web Push fonctionnent (Chrome, Edge, Firefox, Brave, Opera, Samsung).' },
  unknown: { label: 'Plateforme inconnue', hint: '' },
};

export function DashboardNotificationsSection({ t }: { t: (key: string) => string }) {
  const [platform] = useState<Platform>(() => detectPlatform());
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [supported, setSupported] = useState<boolean>(false);
  const [subscribed, setSubscribed] = useState<boolean>(false);
  const [diag, setDiag] = useState<Diagnostic | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [info, setInfo] = useState<string>('');
  const [error, setError] = useState<string>('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSupported(isPushSupported() || isNativeApp());
      setPermission(getNotificationPermission());
      if (isPushSupported()) {
        setSubscribed(await isSubscribedToPush());
      }
      try {
        const d = await apiRequest<Diagnostic>('/notifications/diagnostic');
        setDiag(d);
      } catch {
        setDiag(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleEnable = async () => {
    setError('');
    setInfo('');
    setBusy(true);
    try {
      if (platform === 'ios-safari') {
        setError("Sur Safari iPhone/iPad, installez d'abord Kin-Sell : bouton Partager → « Sur l'écran d'accueil », puis ouvrez l'icône.");
        return;
      }
      if (isNativeApp()) {
        setInfo('Les notifications natives sont gérées automatiquement par l\'application.');
        await refresh();
        return;
      }
      const ok = await subscribeToPush();
      if (ok) {
        setInfo('Notifications activées sur ce navigateur ✅');
        await refresh();
      } else {
        setError("Impossible d'activer les notifications. Vérifiez que vous avez accepté la permission dans votre navigateur.");
      }
    } catch (e: any) {
      setError(e?.message || 'Erreur inattendue lors de l\'activation.');
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setError('');
    setInfo('');
    setBusy(true);
    try {
      const ok = await unsubscribeFromPush();
      if (ok) {
        setInfo('Notifications désactivées sur ce navigateur.');
        await refresh();
      } else {
        setError('Impossible de désactiver les notifications.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setError('');
    setInfo('');
    setBusy(true);
    try {
      const res: any = await apiRequest('/notifications/test', { method: 'POST', body: {} });
      if (res?.ok) {
        setInfo(`Notification de test envoyée (${res.sent?.webSubscriptions ?? 0} web + ${res.sent?.fcmTokens ?? 0} natif). Si vous ne la recevez pas : vérifiez les paramètres système de votre device.`);
      } else {
        setError(res?.error || 'Envoi du test impossible.');
      }
    } catch (e: any) {
      const msg = e?.data?.error || e?.message || 'Envoi du test impossible.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const platformInfo = PLATFORM_INFO[platform];
  const webConfigured = diag?.server.vapidConfigured ?? false;
  const fcmConfigured = diag?.server.fcmConfigured ?? false;
  const devicesCount = (diag?.user.webSubscriptions ?? 0) + (diag?.user.fcmTokens ?? 0);

  return (
    <section className="ud-glass-panel ud-settings-section">
      <div className="ud-settings-section-head">
        <span className="ud-settings-section-icon">🔔</span>
        <h3 className="ud-settings-section-title">Notifications push</h3>
      </div>

      <p className="ud-placeholder-text" style={{ fontSize: '0.88rem', marginTop: 4 }}>
        Recevez une alerte instantanée pour chaque commande, marchandage ou message — même quand l'application est fermée.
      </p>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 16 }}>
          <span className="spinner" /> Chargement...
        </div>
      ) : (
        <>
          {error && (
            <div style={{ background: 'rgba(217,83,79,0.15)', border: '1px solid rgba(217,83,79,0.3)', borderRadius: 12, padding: '10px 14px', marginTop: 12, color: '#ff6b6b', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}
          {info && (
            <div style={{ background: 'rgba(92,184,92,0.12)', border: '1px solid rgba(92,184,92,0.3)', borderRadius: 12, padding: '10px 14px', marginTop: 12, color: '#5cb85c', fontSize: '0.85rem' }}>
              {info}
            </div>
          )}

          {/* ── État de ce device ── */}
          <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            <Row
              label="Plateforme détectée"
              value={platformInfo.label}
              hint={platformInfo.hint}
            />
            <Row
              label="Permission navigateur"
              value={
                permission === 'granted' ? 'Accordée ✅'
                : permission === 'denied' ? 'Refusée ❌ (à réactiver dans les paramètres du navigateur)'
                : 'Non demandée'
              }
              tone={permission === 'granted' ? 'ok' : permission === 'denied' ? 'error' : 'neutral'}
            />
            <Row
              label="Support technique"
              value={supported ? 'Compatible ✅' : 'Non supporté par ce device'}
              tone={supported ? 'ok' : 'error'}
            />
            <Row
              label="Abonné sur ce navigateur"
              value={subscribed ? 'Oui ✅' : 'Non'}
              tone={subscribed ? 'ok' : 'neutral'}
            />
            <Row
              label="Appareils enregistrés (tous devices)"
              value={String(devicesCount)}
              hint={`Web: ${diag?.user.webSubscriptions ?? 0} • Natif: ${diag?.user.fcmTokens ?? 0}`}
            />
          </div>

          {/* ── Actions ── */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
            {!subscribed && !isNativeApp() && (
              <button
                type="button"
                className="ud-quick-btn ud-quick-btn--primary"
                disabled={busy || !supported || permission === 'denied'}
                onClick={handleEnable}
              >
                {busy ? '⏳ Activation...' : '🔔 Activer les notifications'}
              </button>
            )}
            {subscribed && !isNativeApp() && (
              <button
                type="button"
                className="ud-quick-btn"
                disabled={busy}
                onClick={handleDisable}
              >
                🔕 Désactiver sur ce navigateur
              </button>
            )}
            <button
              type="button"
              className="ud-quick-btn"
              disabled={busy || devicesCount === 0}
              onClick={handleTest}
              title={devicesCount === 0 ? 'Activez d\'abord les notifications' : 'Envoyer une notification de test'}
            >
              ✉️ Envoyer un test
            </button>
            <button
              type="button"
              className="ud-quick-btn"
              disabled={busy}
              onClick={refresh}
            >
              ↻ Rafraîchir
            </button>
          </div>

          {/* ── État serveur (diagnostic) ── */}
          {diag && (!webConfigured || !fcmConfigured) && (
            <div style={{ marginTop: 14, padding: 10, borderRadius: 12, background: 'rgba(240,173,78,0.1)', border: '1px solid rgba(240,173,78,0.3)', fontSize: '0.8rem', color: '#f0ad4e' }}>
              ⚠️ Configuration serveur partielle —{' '}
              {!webConfigured && 'Web Push (VAPID) désactivé. '}
              {!fcmConfigured && 'Push natif (FCM) désactivé. '}
              Contactez le support si vous êtes administrateur.
            </div>
          )}

          {/* ── Guide iOS Safari ── */}
          {platform === 'ios-safari' && (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: 'rgba(111,88,255,0.1)', border: '1px solid rgba(111,88,255,0.3)', fontSize: '0.85rem', color: 'var(--color-text)' }}>
              📱 <strong>iPhone / iPad</strong> — pour recevoir les notifications hors-site :
              <ol style={{ marginTop: 6, marginBottom: 0, paddingLeft: 22, lineHeight: 1.6 }}>
                <li>Appuyez sur le bouton <strong>Partager</strong> dans Safari</li>
                <li>Choisissez <strong>« Sur l'écran d'accueil »</strong></li>
                <li>Ouvrez Kin-Sell depuis l'icône de l'écran d'accueil</li>
                <li>Revenez ici et appuyez sur « Activer les notifications »</li>
              </ol>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Row({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'ok' | 'error' | 'neutral';
}) {
  const color = tone === 'ok' ? '#5cb85c' : tone === 'error' ? '#ff6b6b' : 'var(--color-text)';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>{label}</div>
        {hint && <div style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)', marginTop: 2, opacity: 0.8 }}>{hint}</div>}
      </div>
      <div style={{ fontSize: '0.88rem', fontWeight: 600, color, textAlign: 'right', flexShrink: 0 }}>
        {value}
      </div>
    </div>
  );
}
