package com.kinsell.app;

import android.Manifest;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.app.KeyguardManager;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Vibrator;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import android.os.VibratorManager;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private boolean keepScreenOnEnabled = false;

    /**
     * Sanitise une chaîne pour injection sûre dans evaluateJavascript().
     * Échappe les quotes, backslashes, retours à la ligne et caractères de contrôle.
     */
    private static String sanitizeForJs(String input) {
        if (input == null) return "";
        return input
            .replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("<", "\\x3c")
            .replace(">", "\\x3e");
    }

    /**
     * Écoute les rejets d'appel déclenchés depuis la notification
     * pendant que l'app est ouverte (broadcast interne).
     */
    private final BroadcastReceiver callRejectReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null) return;
            String conversationId = intent.getStringExtra("conversationId");
            String callerId = intent.getStringExtra("callerId");
            if (conversationId == null || callerId == null) return;
            dispatchCallRejectToWebView(conversationId, callerId);
        }
    };

    /**
     * Écoute les raccrocher d'appel en cours depuis la notification.
     */
    private final BroadcastReceiver callHangupReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null) return;
            String conversationId = intent.getStringExtra("conversationId");
            String remoteUserId = intent.getStringExtra("remoteUserId");
            if (conversationId == null) conversationId = "";
            if (remoteUserId == null) remoteUserId = "";
            dispatchCallHangupToWebView(conversationId, remoteUserId);
        }
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Force dark mode off globally — Kin-Sell handles its own dark theme
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO);
        registerPlugin(AudioRoutePlugin.class);
        registerPlugin(CallNotificationPlugin.class);
        registerPlugin(KinSellBackgroundPlugin.class);
        registerPlugin(UnityAdsPlugin.class);

        // Create all notification channels (son, vibration, LED)
        NotificationChannels.createChannels(this);

        super.onCreate(savedInstanceState);

        // Permettre l'affichage sur écran verrouillé (appels entrants)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            );
        }
        // KEEP_SCREEN_ON est activé dynamiquement uniquement en contexte d'appel.

        // Disable WebView force-dark (Android 13+)
        try {
            WebView webView = getBridge().getWebView();
            if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
                WebSettingsCompat.setAlgorithmicDarkeningAllowed(webView.getSettings(), false);
            } else if (WebViewFeature.isFeatureSupported(WebViewFeature.FORCE_DARK)) {
                WebSettingsCompat.setForceDark(webView.getSettings(), WebSettingsCompat.FORCE_DARK_OFF);
            }
        } catch (Exception e) {
            // Ignore — older WebView may not support this
        }

        // Si c'est un lancement depuis un appel, s'assurer que le keyguard est retiré
        if (getIntent() != null && "call".equals(getIntent().getStringExtra("type"))) {
            ensureLockScreenFlags();
        }

        // Handle call notification tap (from full-screen intent)
        handleCallIntent(getIntent());

        // Si c'est un accept depuis la notification → nettoyer notif + vibration
        handleCallAcceptCleanup(getIntent());

        // Vérifier la permission USE_FULL_SCREEN_INTENT (Android 14+)
        requestFullScreenIntentPermission();

        // Demander POST_NOTIFICATIONS pour Android 13+ (Tiramisu)
        // Plus fiable que le bridge Capacitor seul (Samsung peut ignorer)
        requestNotificationPermission();
        ensureNotificationsEnabled();

        // Flush pending FCM token (saved by KinSellMessagingService.onNewToken in background)
        flushPendingFcmToken();

        // Flush pending call reject (saved by CallActionReceiver when app was in background)
        flushPendingCallReject();

        // Flush incoming call ONLY if the user didn't already accept via notification button.
        // If callAction=accept is in the intent, the call is being accepted → don't re-show overlay.
        String callAction = getIntent() != null ? getIntent().getStringExtra("callAction") : null;
        if (!"accept".equals(callAction)) {
            flushPendingIncomingCall();
        } else {
            // Clear the pending call to avoid re-dispatch on next resume
            try {
                android.content.SharedPreferences prefs =
                    getSharedPreferences("kin_sell_prefs", MODE_PRIVATE);
                prefs.edit()
                    .remove("pending_incoming_call")
                    .remove("pending_incoming_call_ts")
                    .apply();
            } catch (Exception ignored) {}
        }

        // Demander l'exclusion d'optimisation batterie (Samsung/Xiaomi/etc.)
        // Utilise OemBatteryHelper pour chaque fabricant spécifique
        if (OemBatteryHelper.isBatteryOptimized(this)) {
            OemBatteryHelper.requestOemBatteryExemption(this);
        }

        // Démarrer le foreground service persistant (comme WhatsApp)
        // Empêche Samsung "Suspendre activité si inutilisé" de tuer l'app
        startConnectionService();

        // Écouter les rejets d'appel depuis la notification (app ouverte)
        IntentFilter filter = new IntentFilter("com.kinsell.app.CALL_REJECTED_INTERNAL");
        IntentFilter hangupFilter = new IntentFilter("com.kinsell.app.CALL_HANGUP_INTERNAL");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(callRejectReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            registerReceiver(callHangupReceiver, hangupFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(callRejectReceiver, filter);
            registerReceiver(callHangupReceiver, hangupFilter);
        }
    }

    private void flushPendingFcmToken() {
        try {
            android.content.SharedPreferences prefs =
                getSharedPreferences("kin_sell_prefs", MODE_PRIVATE);
            String pendingToken = prefs.getString("pending_fcm_token", null);
            if (pendingToken != null && !pendingToken.isEmpty()) {
                WebView webView = getBridge().getWebView();
                if (webView != null) {
                    final String token = sanitizeForJs(pendingToken);
                    // Delay dispatch to give JS enough time to set up listeners
                    webView.postDelayed(() -> webView.evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('ks:fcm-token',{detail:{token:'" + token + "'}}));",
                        null), 3000);
                }
                prefs.edit().remove("pending_fcm_token").apply();
            }
        } catch (Exception e) {
            // Ignore — WebView may not be ready yet
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Si c'est un appel, re-appliquer les flags d'écran verrouillé
        if (intent != null && "call".equals(intent.getStringExtra("type"))) {
            ensureLockScreenFlags();
        }
        handleCallIntent(intent);
        handleCallAcceptCleanup(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        flushPendingFcmToken();
    }

    /**
     * Réapplique les flags pour afficher l'activité par-dessus l'écran verrouillé
     * et demande au KeyguardManager de retirer le keyguard.
     */
    private void ensureLockScreenFlags() {
        enableKeepScreenOn();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            );
        }
        // Demander au KeyguardManager de retirer l'écran de verrouillage
        try {
            KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
            if (km != null && km.isKeyguardLocked()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    km.requestDismissKeyguard(this, null);
                }
            }
        } catch (Exception ignored) {}
    }

    private void handleCallIntent(Intent intent) {
        if (intent == null) return;
        String url = intent.getStringExtra("url");
        if (url != null && !url.isEmpty()) {
            try {
                WebView webView = getBridge().getWebView();
                if (webView != null) {
                    final String navUrl = sanitizeForJs(url);
                    // Utiliser pushState + popstate pour navigation SPA sans reload
                    webView.post(() -> webView.evaluateJavascript(
                        "(function(){" +
                        "var u='" + navUrl + "';" +
                        "if(window.location.pathname+window.location.search===u)return;" +
                        "window.history.pushState({},'',u);" +
                        "window.dispatchEvent(new PopStateEvent('popstate'));" +
                        "})();",
                        null));
                }
            } catch (Exception e) {
                // Ignore
            }
        }
    }

    /**
     * Flush un rejet d'appel stocké en SharedPreferences
     * (quand l'utilisateur refuse depuis la notification alors que l'app est fermée).
     */
    private void flushPendingCallReject() {
        try {
            android.content.SharedPreferences prefs =
                getSharedPreferences("kin_sell_prefs", MODE_PRIVATE);
            String pendingReject = prefs.getString("pending_call_reject", null);
            if (pendingReject != null && !pendingReject.isEmpty()) {
                prefs.edit().remove("pending_call_reject").apply();
                String[] parts = pendingReject.split("\\|");
                if (parts.length >= 2) {
                    dispatchCallRejectToWebView(parts[0], parts[1]);
                }
            }
        } catch (Exception ignored) {}
    }

    /**
     * Flush un appel entrant sauvé par KinSellMessagingService quand l'app était tuée.
     * Dispatche l'appel à la WebView pour que le UI d'appel entrant s'affiche.
     * Expire après 35s (le serveur timeout à 30s).
     */
    private void flushPendingIncomingCall() {
        try {
            android.content.SharedPreferences prefs =
                getSharedPreferences("kin_sell_prefs", MODE_PRIVATE);
            String pendingCall = prefs.getString("pending_incoming_call", null);
            long ts = prefs.getLong("pending_incoming_call_ts", 0);
            // Effacer immédiatement pour éviter les doublons
            prefs.edit()
                .remove("pending_incoming_call")
                .remove("pending_incoming_call_ts")
                .apply();
            if (pendingCall == null || pendingCall.isEmpty()) return;
            // Expiration : si l'appel date de plus de 35s, il a expiré côté serveur
            if (System.currentTimeMillis() - ts > 35_000) return;

            enableKeepScreenOn();

            String[] parts = pendingCall.split("\\|");
            if (parts.length < 3) return;
            String conversationId = parts[0];
            String callerId = parts[1];
            String callType = parts[2];
            String callerName = parts.length > 3 ? parts[3] : "";

            // Dispatcher l'appel avec un délai pour que la WebView + Socket soient prêts
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                final String cid = sanitizeForJs(conversationId);
                final String uid = sanitizeForJs(callerId);
                final String ct = sanitizeForJs(callType);
                final String cn = sanitizeForJs(callerName);
                // Délai de 2s pour laisser le temps au socket de se connecter
                webView.postDelayed(() -> webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('ks:native-incoming-call',{detail:{" +
                    "conversationId:'" + cid + "'," +
                    "callerId:'" + uid + "'," +
                    "callType:'" + ct + "'," +
                    "callerName:'" + cn + "'" +
                    "}}));",
                    null), 2000);
            }
        } catch (Exception ignored) {}
    }

    /**
     * Démarre le service de connexion persistant.
     * Comme WhatsApp, ce foreground service empêche Android de tuer l'app.
     */
    private void startConnectionService() {
        try {
            Intent intent = new Intent(this, KinSellConnectionService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent);
            } else {
                startService(intent);
            }
        } catch (Exception ignored) {
            // Android 12+ peut bloquer le démarrage en "exact alarm" mode
        }
    }

    /**
     * Envoie un événement de rejet d'appel à la WebView.
     */
    private void dispatchCallRejectToWebView(String conversationId, String callerId) {
        disableKeepScreenOn();
        try {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                final String cid = sanitizeForJs(conversationId);
                final String uid = sanitizeForJs(callerId);
                webView.post(() -> webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('ks:native-call-reject'," +
                    "{detail:{conversationId:'" + cid + "',callerId:'" + uid + "'}}));",
                    null));
            }
        } catch (Exception ignored) {}
    }

    /**
     * Envoie un événement de raccrocher à la WebView (depuis la notification ongoing).
     */
    private void dispatchCallHangupToWebView(String conversationId, String remoteUserId) {
        disableKeepScreenOn();
        try {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                final String cid = sanitizeForJs(conversationId);
                final String uid = sanitizeForJs(remoteUserId);
                webView.post(() -> webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('ks:native-call-hangup'," +
                    "{detail:{conversationId:'" + cid + "',remoteUserId:'" + uid + "'}}));",
                    null));
            }
        } catch (Exception ignored) {}
    }

    /**
     * Quand l'utilisateur appuie sur "Accepter" depuis la notification,
     * la notification d'appel entrant et la vibration doivent être nettoyées.
     * (Avant, ça passait par CallActionReceiver, mais Android 12+ bloque
     *  le startActivity depuis un BroadcastReceiver.)
     */
    private void handleCallAcceptCleanup(Intent intent) {
        if (intent == null) return;
        String callAction = intent.getStringExtra("callAction");
        if (!"accept".equals(callAction)) return;

        enableKeepScreenOn();

        // Annuler la notification d'appel entrant
        try {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.cancel(CallActionReceiver.CALL_NOTIFICATION_ID);
            }
        } catch (Exception ignored) {}

        // Arrêter la vibration
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) getSystemService(VIBRATOR_MANAGER_SERVICE);
                if (vm != null) vm.getDefaultVibrator().cancel();
            } else {
                Vibrator vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
                if (vibrator != null) vibrator.cancel();
            }
        } catch (Exception ignored) {}
    }

    /**
     * Android 13+ (Tiramisu, API 33) : POST_NOTIFICATIONS obligatoire.
     * On le demande directement en Java car le bridge Capacitor peut échouer
     * silencieusement sur certains OEM (Samsung notamment).
     */
    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                        new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1001);
            }
        }
    }

    /**
     * Si l'utilisateur a bloqué les notifications au niveau Android,
     * ouvrir une fois les réglages système de l'app.
     */
    private void ensureNotificationsEnabled() {
        try {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm == null) return;

            boolean enabled = nm.areNotificationsEnabled();
            if (enabled) return;

            android.content.SharedPreferences prefs =
                getSharedPreferences("kin_sell_prefs", MODE_PRIVATE);
            boolean alreadyPrompted = prefs.getBoolean("notif_settings_prompted", false);
            if (alreadyPrompted) return;

            prefs.edit().putBoolean("notif_settings_prompted", true).apply();
            openNotificationSettings();
        } catch (Exception ignored) {
            // Ignore — OEM specific behavior
        }
    }

    private void openNotificationSettings() {
        try {
            Intent intent = new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getPackageName());
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception ignored) {
            // Fallback for OEMs that ignore ACTION_APP_NOTIFICATION_SETTINGS
            try {
                Intent fallback = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                fallback.setData(android.net.Uri.parse("package:" + getPackageName()));
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(fallback);
            } catch (Exception ignoredAgain) {
                // Ignore
            }
        }
    }

    /**
     * Android 14+ (API 34) : USE_FULL_SCREEN_INTENT est une permission spéciale.
     * Sans elle, l'appel entrant ne s'affiche pas en plein écran sur l'écran verrouillé.
     */
    private void requestFullScreenIntentPermission() {
        if (Build.VERSION.SDK_INT >= 34) {
            try {
                NotificationManager nm = getSystemService(NotificationManager.class);
                if (nm != null && !nm.canUseFullScreenIntent()) {
                    // Ouvrir les paramètres pour que l'utilisateur accorde la permission
                    Intent intent = new Intent(
                        android.provider.Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                        android.net.Uri.parse("package:" + getPackageName()));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                }
            } catch (Exception ignored) {
                // Fallback : certains OEM ne supportent pas cet intent
            }
        }
    }

    @Override
    public void onDestroy() {
        disableKeepScreenOn();
        try {
            unregisterReceiver(callRejectReceiver);
        } catch (Exception ignored) {}
        try {
            unregisterReceiver(callHangupReceiver);
        } catch (Exception ignored) {}
        super.onDestroy();
    }
    private void enableKeepScreenOn() {
        if (keepScreenOnEnabled) return;
        try {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            keepScreenOnEnabled = true;
        } catch (Exception ignored) {}
    }

    private void disableKeepScreenOn() {
        if (!keepScreenOnEnabled) return;
        try {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            keepScreenOnEnabled = false;
        } catch (Exception ignored) {}
    }
}
