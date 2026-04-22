package com.kinsell.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

/**
 * A17 audit : relance le service de connexion persistante au boot de l'appareil
 * si l'utilisateur était connecté avant le redémarrage.
 *
 * Sans ce receiver, l'app est tuée au reboot et l'utilisateur reste offline
 * jusqu'à qu'il ouvre manuellement Kin-Sell.
 *
 * Un flag `user_logged_in` est posé dans les SharedPreferences `kin_sell_prefs`
 * au login (et retiré au logout), et consulté ici pour décider du démarrage.
 */
public class KinSellBootReceiver extends BroadcastReceiver {
    private static final String TAG = "KinSellBootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            String action = intent != null ? intent.getAction() : null;
            if (action == null) return;

            boolean isBoot = action.equals(Intent.ACTION_BOOT_COMPLETED)
                    || action.equals("android.intent.action.QUICKBOOT_POWERON")
                    || action.equals("com.htc.intent.action.QUICKBOOT_POWERON")
                    || action.equals(Intent.ACTION_MY_PACKAGE_REPLACED);
            if (!isBoot) return;

            SharedPreferences prefs = context.getSharedPreferences("kin_sell_prefs", Context.MODE_PRIVATE);
            if (!prefs.getBoolean("user_logged_in", false)) {
                Log.i(TAG, "Boot ignored (user not logged in)");
                return;
            }

            Intent svc = new Intent(context, KinSellConnectionService.class);
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(svc);
                } else {
                    context.startService(svc);
                }
                Log.i(TAG, "Connection service started after boot");
            } catch (Throwable t) {
                // Android 12+ peut refuser startForegroundService depuis un
                // BroadcastReceiver en arrière-plan — silencieux, FCM prendra le relais.
                Log.w(TAG, "startForegroundService refused at boot", t);
            }
        } catch (Throwable t) {
            Log.w(TAG, "onReceive failed", t);
        }
    }
}
