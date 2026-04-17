package com.kinsell.app;

import android.app.Activity;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.unity3d.ads.IUnityAdsInitializationListener;
import com.unity3d.ads.IUnityAdsLoadListener;
import com.unity3d.ads.IUnityAdsShowListener;
import com.unity3d.ads.UnityAds;
import com.unity3d.ads.UnityAdsShowOptions;

/**
 * Plugin Capacitor pour Unity Ads.
 *
 * Méthodes JS :
 *   UnityAdsPlugin.initialize({ testMode? })
 *   UnityAdsPlugin.loadInterstitial()
 *   UnityAdsPlugin.loadRewarded()
 *   UnityAdsPlugin.showInterstitial()
 *   UnityAdsPlugin.showRewarded()
 *   UnityAdsPlugin.isReady({ placementId })
 *
 * Game ID Android : 6093561
 * Placements par défaut : Interstitial_Android, Rewarded_Android
 */
@CapacitorPlugin(name = "UnityAdsPlugin")
public class UnityAdsPlugin extends Plugin {

    private static final String TAG = "UnityAdsPlugin";
    private static final String GAME_ID_ANDROID = "6093561";
    private static final String PLACEMENT_INTERSTITIAL = "Interstitial_Android";
    private static final String PLACEMENT_REWARDED = "Rewarded_Android";

    private boolean initialized = false;
    private boolean interstitialLoaded = false;
    private boolean rewardedLoaded = false;

    // ── Initialize ──────────────────────────────────────────

    @PluginMethod
    public void initialize(PluginCall call) {
        if (initialized) {
            call.resolve(result("already_initialized"));
            return;
        }

        boolean testMode = call.getBoolean("testMode", false);
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity available");
            return;
        }

        UnityAds.initialize(activity.getApplicationContext(), GAME_ID_ANDROID, testMode,
            new IUnityAdsInitializationListener() {
                @Override
                public void onInitializationComplete() {
                    initialized = true;
                    Log.i(TAG, "Unity Ads initialized (testMode=" + testMode + ")");
                    call.resolve(result("initialized"));
                    // Pre-load ads after init
                    loadAd(PLACEMENT_INTERSTITIAL);
                    loadAd(PLACEMENT_REWARDED);
                }

                @Override
                public void onInitializationFailed(UnityAds.UnityAdsInitializationError error, String message) {
                    Log.e(TAG, "Unity Ads init failed: " + error + " — " + message);
                    call.reject("Init failed: " + error + " — " + message);
                }
            }
        );
    }

    // ── Load ────────────────────────────────────────────────

    private void loadAd(String placementId) {
        UnityAds.load(placementId, new IUnityAdsLoadListener() {
            @Override
            public void onUnityAdsAdLoaded(String id) {
                Log.i(TAG, "Ad loaded: " + id);
                if (PLACEMENT_INTERSTITIAL.equals(id)) interstitialLoaded = true;
                if (PLACEMENT_REWARDED.equals(id)) rewardedLoaded = true;
                notifyListeners("adLoaded", new JSObject().put("placementId", id));
            }

            @Override
            public void onUnityAdsFailedToLoad(String id, UnityAds.UnityAdsLoadError error, String message) {
                Log.w(TAG, "Ad load failed: " + id + " — " + error + " — " + message);
                notifyListeners("adLoadFailed", new JSObject()
                    .put("placementId", id)
                    .put("error", error.toString())
                    .put("message", message));
            }
        });
    }

    @PluginMethod
    public void loadInterstitial(PluginCall call) {
        if (!initialized) { call.reject("Not initialized"); return; }
        interstitialLoaded = false;
        loadAd(PLACEMENT_INTERSTITIAL);
        call.resolve(result("loading"));
    }

    @PluginMethod
    public void loadRewarded(PluginCall call) {
        if (!initialized) { call.reject("Not initialized"); return; }
        rewardedLoaded = false;
        loadAd(PLACEMENT_REWARDED);
        call.resolve(result("loading"));
    }

    // ── Show ────────────────────────────────────────────────

    @PluginMethod
    public void showInterstitial(PluginCall call) {
        showAd(PLACEMENT_INTERSTITIAL, call);
    }

    @PluginMethod
    public void showRewarded(PluginCall call) {
        showAd(PLACEMENT_REWARDED, call);
    }

    private void showAd(String placementId, PluginCall call) {
        if (!initialized) { call.reject("Not initialized"); return; }

        Activity activity = getActivity();
        if (activity == null) { call.reject("No activity"); return; }

        boolean isLoaded = PLACEMENT_INTERSTITIAL.equals(placementId) ? interstitialLoaded : rewardedLoaded;
        if (!isLoaded) { call.reject("Ad not loaded for " + placementId); return; }

        activity.runOnUiThread(() -> {
            UnityAds.show(activity, placementId, new UnityAdsShowOptions(),
                new IUnityAdsShowListener() {
                    @Override
                    public void onUnityAdsShowComplete(String id, UnityAds.UnityAdsShowCompletionState state) {
                        Log.i(TAG, "Ad show complete: " + id + " state=" + state);
                        // Mark as consumed
                        if (PLACEMENT_INTERSTITIAL.equals(id)) interstitialLoaded = false;
                        if (PLACEMENT_REWARDED.equals(id)) rewardedLoaded = false;

                        JSObject res = new JSObject();
                        res.put("placementId", id);
                        res.put("state", state.toString());
                        res.put("completed", state == UnityAds.UnityAdsShowCompletionState.COMPLETED);
                        res.put("skipped", state == UnityAds.UnityAdsShowCompletionState.SKIPPED);
                        call.resolve(res);

                        notifyListeners("adShowComplete", res);

                        // Auto-reload for next time
                        loadAd(id);
                    }

                    @Override
                    public void onUnityAdsShowFailure(String id, UnityAds.UnityAdsShowError error, String message) {
                        Log.e(TAG, "Ad show failed: " + id + " — " + error + " — " + message);
                        call.reject("Show failed: " + error + " — " + message);
                        notifyListeners("adShowFailed", new JSObject()
                            .put("placementId", id)
                            .put("error", error.toString())
                            .put("message", message));
                    }

                    @Override
                    public void onUnityAdsShowStart(String id) {
                        Log.i(TAG, "Ad show start: " + id);
                        notifyListeners("adShowStart", new JSObject().put("placementId", id));
                    }

                    @Override
                    public void onUnityAdsShowClick(String id) {
                        Log.i(TAG, "Ad clicked: " + id);
                        notifyListeners("adClicked", new JSObject().put("placementId", id));
                    }
                }
            );
        });
    }

    // ── Status ──────────────────────────────────────────────

    @PluginMethod
    public void isReady(PluginCall call) {
        String placementId = call.getString("placementId", PLACEMENT_INTERSTITIAL);
        boolean ready;
        if (PLACEMENT_INTERSTITIAL.equals(placementId)) {
            ready = interstitialLoaded;
        } else if (PLACEMENT_REWARDED.equals(placementId)) {
            ready = rewardedLoaded;
        } else {
            ready = false;
        }
        JSObject res = new JSObject();
        res.put("ready", ready);
        res.put("initialized", initialized);
        res.put("placementId", placementId);
        call.resolve(res);
    }

    // ── Helper ──────────────────────────────────────────────

    private JSObject result(String status) {
        return new JSObject().put("status", status);
    }
}
