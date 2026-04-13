package com.kinsell.app;

import android.content.Intent;
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
