package com.kinsell.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

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
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

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

        // Handle call notification tap (from full-screen intent)
        handleCallIntent(getIntent());

        // Flush pending FCM token (saved by KinSellMessagingService.onNewToken in background)
        flushPendingFcmToken();

        // Flush pending call reject (saved by CallActionReceiver when app was in background)
        flushPendingCallReject();

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
                    final String token = pendingToken.replace("'", "\\'");
                    webView.post(() -> webView.evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('ks:fcm-token',{detail:{token:'" + token + "'}}));",
                        null));
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
        handleCallIntent(intent);
    }

    private void handleCallIntent(Intent intent) {
        if (intent == null) return;
        String url = intent.getStringExtra("url");
        if (url != null && !url.isEmpty()) {
            try {
                WebView webView = getBridge().getWebView();
                if (webView != null) {
                    final String navUrl = url.replace("'", "\\'");
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
     * Envoie un événement de rejet d'appel à la WebView.
     */
    private void dispatchCallRejectToWebView(String conversationId, String callerId) {
        try {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                final String cid = conversationId.replace("'", "\\'");
                final String uid = callerId.replace("'", "\\'");
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
        try {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                final String cid = conversationId.replace("'", "\\'");
                final String uid = remoteUserId.replace("'", "\\'");
                webView.post(() -> webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('ks:native-call-hangup'," +
                    "{detail:{conversationId:'" + cid + "',remoteUserId:'" + uid + "'}}));",
                    null));
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onDestroy() {
        try {
            unregisterReceiver(callRejectReceiver);
        } catch (Exception ignored) {}
        try {
            unregisterReceiver(callHangupReceiver);
        } catch (Exception ignored) {}
        super.onDestroy();
    }
}
