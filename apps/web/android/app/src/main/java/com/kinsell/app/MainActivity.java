package com.kinsell.app;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Force dark mode off globally — Kin-Sell handles its own dark theme
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO);
        registerPlugin(AudioRoutePlugin.class);

        // Create all notification channels (son, vibration, LED)
        NotificationChannels.createChannels(this);

        super.onCreate(savedInstanceState);

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
            // Navigate the WebView to the call page
            try {
                WebView webView = getBridge().getWebView();
                if (webView != null) {
                    final String navUrl = url;
                    webView.post(() -> webView.evaluateJavascript(
                            "window.location.href='" + navUrl.replace("'", "\\'") + "';", null));
                }
            } catch (Exception e) {
                // Ignore
            }
        }
    }
}
