package com.kinsell.app;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.service.notification.StatusBarNotification;

import androidx.core.app.NotificationCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Plugin Capacitor pour gérer la notification persistante d'appel en cours.
 *
 * Affiché quand un appel est actif (status "connected") :
 * - Non-supprimable (ongoing)
 * - Actions : "Retour à l'appel" + "Raccrocher"
 * - Disparaît quand l'appel se termine
 */
@CapacitorPlugin(name = "CallNotification")
public class CallNotificationPlugin extends Plugin {

    public static final int ONGOING_NOTIFICATION_ID = 9998;

    /**
     * Affiche la notification d'appel en cours.
     * options: { callerName: string, conversationId: string, remoteUserId: string }
     */
    @PluginMethod
    public void showOngoing(PluginCall call) {
        // P2 #21 : null-check défensif sur getContext() — plugin peut être
        // appelé avant attachement complet sur certains cycles Capacitor.
        android.content.Context ctx = getContext();
        if (ctx == null) { call.reject("Context unavailable"); return; }

        String callerName = call.getString("callerName", "Appel en cours");
        String conversationId = call.getString("conversationId", "");
        String remoteUserId = call.getString("remoteUserId", "");

        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags |= PendingIntent.FLAG_IMMUTABLE;
        }

        try {
            // ── Tap : retour à la page d'appel ──
            Intent returnIntent = new Intent(ctx, MainActivity.class);
            returnIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            returnIntent.putExtra("url", "/messaging?convId=" + conversationId);
            PendingIntent returnPI = PendingIntent.getActivity(ctx, 10, returnIntent, piFlags);

            // ── Action : Raccrocher ──
            Intent hangupIntent = new Intent(ctx, CallActionReceiver.class);
            hangupIntent.setAction(CallActionReceiver.ACTION_HANGUP);
            hangupIntent.putExtra("conversationId", conversationId);
            hangupIntent.putExtra("remoteUserId", remoteUserId);
            PendingIntent hangupPI = PendingIntent.getBroadcast(ctx, 11, hangupIntent, piFlags);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(
                    ctx, NotificationChannels.CHANNEL_ONGOING_CALL)
                    .setSmallIcon(R.drawable.ic_notification)
                    .setContentTitle("Appel en cours")
                    .setContentText(callerName)
                    .setSubText("Kin-Sell")
                    .setColor(0xFF4CAF50)
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                    .setCategory(NotificationCompat.CATEGORY_CALL)
                    .setOngoing(true)
                    .setAutoCancel(false)
                    .setContentIntent(returnPI)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                    .setUsesChronometer(true)              // Affiche un compteur de temps
                    .setWhen(System.currentTimeMillis())    // Point de départ du chrono
                    .addAction(0, "🔙 Retour", returnPI)
                    .addAction(0, "📞 Raccrocher", hangupPI);

            NotificationManager manager = ctx.getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.notify(ONGOING_NOTIFICATION_ID, builder.build());
            }
        } catch (Throwable t) {
            call.reject("showOngoing failed: " + t.getMessage());
            return;
        }

        call.resolve();
    }

    /**
     * Retire la notification d'appel en cours.
     */
    @PluginMethod
    public void hideOngoing(PluginCall call) {
        try {
            android.content.Context ctx = getContext();
            if (ctx != null) {
                NotificationManager manager = ctx.getSystemService(NotificationManager.class);
                if (manager != null) manager.cancel(ONGOING_NOTIFICATION_ID);
            }
        } catch (Throwable ignored) {}
        call.resolve();
    }

    /**
     * Retire toutes les notifications Kin-Sell (sauf appel en cours).
     * À appeler quand l'app revient au premier plan.
     */
    @PluginMethod
    public void clearAllNotifications(PluginCall call) {
        try {
            android.content.Context ctx = getContext();
            if (ctx != null) {
                NotificationManager manager = ctx.getSystemService(NotificationManager.class);
                if (manager != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        for (StatusBarNotification sbn : manager.getActiveNotifications()) {
                            if (sbn.getId() != ONGOING_NOTIFICATION_ID) {
                                manager.cancel(sbn.getId());
                            }
                        }
                    } else {
                        manager.cancelAll();
                    }
                }
            }
        } catch (Throwable ignored) {}
        call.resolve();
    }

    /**
     * Retire la notification d'appel entrant (ID 9999).
     * À appeler quand l'appel est traité via socket (accepté, rejeté, etc.).
     */
    @PluginMethod
    public void clearCallNotification(PluginCall call) {
        try {
            android.content.Context ctx = getContext();
            if (ctx != null) {
                NotificationManager manager = ctx.getSystemService(NotificationManager.class);
                if (manager != null) manager.cancel(CallActionReceiver.CALL_NOTIFICATION_ID);
            }
        } catch (Throwable ignored) {}
        call.resolve();
    }
}
