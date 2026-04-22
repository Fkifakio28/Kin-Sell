package com.kinsell.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Plugin Capacitor pour gérer le service de connexion persistant
 * et les optimisations batterie OEM.
 *
 * Méthodes JS:
 *   KinSellBackground.startService()   — démarre le foreground service
 *   KinSellBackground.stopService()    — arrête le foreground service
 *   KinSellBackground.setLoggedIn({ loggedIn: boolean }) — flag pour boot receiver
 *   KinSellBackground.requestBatteryExemption() — ouvre les paramètres batterie OEM
 *   KinSellBackground.isBatteryOptimized()      — vérifie si l'app est restreinte
 */
@CapacitorPlugin(name = "KinSellBackground")
public class KinSellBackgroundPlugin extends Plugin {

    @PluginMethod
    public void startService(PluginCall call) {
        try {
            Intent intent = new Intent(getContext(), KinSellConnectionService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to start service: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopService(PluginCall call) {
        try {
            Intent intent = new Intent(getContext(), KinSellConnectionService.class);
            getContext().stopService(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to stop service: " + e.getMessage());
        }
    }

    /**
     * A17 audit : JS appelle setLoggedIn(true) après un login réussi et
     * setLoggedIn(false) au logout. Le flag est lu par KinSellBootReceiver
     * au boot pour décider de relancer le service.
     */
    @PluginMethod
    public void setLoggedIn(PluginCall call) {
        try {
            boolean loggedIn = call.getBoolean("loggedIn", false);
            SharedPreferences prefs = getContext().getSharedPreferences("kin_sell_prefs", Context.MODE_PRIVATE);
            prefs.edit().putBoolean("user_logged_in", loggedIn).apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to set logged in flag: " + e.getMessage());
        }
    }

    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        try {
            boolean launched = OemBatteryHelper.requestOemBatteryExemption(getContext());
            call.resolve(new com.getcapacitor.JSObject().put("launched", launched));
        } catch (Exception e) {
            call.reject("Failed to request exemption: " + e.getMessage());
        }
    }

    @PluginMethod
    public void isBatteryOptimized(PluginCall call) {
        boolean optimized = OemBatteryHelper.isBatteryOptimized(getContext());
        call.resolve(new com.getcapacitor.JSObject().put("optimized", optimized));
    }
}
