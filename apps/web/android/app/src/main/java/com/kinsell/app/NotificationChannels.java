package com.kinsell.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

/**
 * Canaux de notification Kin-Sell v3 — sons système uniquement.
 *
 * Les IDs portent le suffixe "-v3" pour forcer Android à créer de nouveaux
 * canaux propres. Android ne permet PAS de modifier un canal après création,
 * donc tout changement de son/vibration nécessite un nouveau suffixe.
 */
public class NotificationChannels {

    // ── Nouveaux IDs v3 (reset complet — sons système garantis) ──
    public static final String CHANNEL_MESSAGES = "kin-sell-messages-v3";
    public static final String CHANNEL_CALLS = "kin-sell-calls-v3";
    public static final String CHANNEL_ONGOING_CALL = "kin-sell-ongoing-call-v3";
    public static final String CHANNEL_ORDERS = "kin-sell-orders-v3";
    public static final String CHANNEL_SOCIAL = "kin-sell-social-v3";
    public static final String CHANNEL_DEFAULT = "kin-sell-default-v3";

    // Anciens IDs à supprimer (v1 + v2)
    private static final String[] OLD_CHANNELS = {
        "kin-sell-messages", "kin-sell-calls", "kin-sell-ongoing-call",
        "kin-sell-orders", "kin-sell-social", "kin-sell-default",
        "kin-sell-connection",
        "kin-sell-messages-v2", "kin-sell-calls-v2", "kin-sell-ongoing-call-v2",
        "kin-sell-orders-v2", "kin-sell-social-v2", "kin-sell-default-v2"
    };

    public static void createChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        // ── Supprimer les anciens canaux corrompus (migration unique) ──
        for (String oldId : OLD_CHANNELS) {
            if (manager.getNotificationChannel(oldId) != null) {
                manager.deleteNotificationChannel(oldId);
            }
        }

        // ── Sons système par défaut (pas de sons custom dans l'APK) ──
        Uri notifSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        Uri ringtoneSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);

        AudioAttributes notifAttr = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        AudioAttributes ringtoneAttr = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();

        // ── Messages : haute priorité, son notification système ──
        NotificationChannel messages = new NotificationChannel(
                CHANNEL_MESSAGES, "Messages Kin-Sell", NotificationManager.IMPORTANCE_HIGH);
        messages.setDescription("Nouveaux messages et conversations");
        messages.setSound(notifSound, notifAttr);
        messages.enableVibration(true);
        messages.setVibrationPattern(new long[]{0, 250, 100, 250});
        messages.enableLights(true);
        messages.setLightColor(0xFF6F58FF);
        messages.setShowBadge(true);
        messages.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);

        // ── Appels : priorité maximale, sonnerie système du téléphone ──
        NotificationChannel calls = new NotificationChannel(
                CHANNEL_CALLS, "Appels Kin-Sell", NotificationManager.IMPORTANCE_MAX);
        calls.setDescription("Appels audio et vidéo entrants");
        calls.setSound(ringtoneSound, ringtoneAttr);
        calls.enableVibration(true);
        calls.setVibrationPattern(new long[]{0, 500, 200, 500, 200, 500});
        calls.enableLights(true);
        calls.setLightColor(0xFF4CAF50);
        calls.setShowBadge(true);
        calls.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);

        // ── Appel en cours : priorité basse, silencieux, persistant ──
        NotificationChannel ongoingCall = new NotificationChannel(
                CHANNEL_ONGOING_CALL, "Appel en cours", NotificationManager.IMPORTANCE_LOW);
        ongoingCall.setDescription("Notification persistante pendant un appel actif");
        ongoingCall.setSound(null, null);
        ongoingCall.enableVibration(false);
        ongoingCall.enableLights(false);
        ongoingCall.setShowBadge(false);

        // ── Commandes & Transactions : son notification système ──
        NotificationChannel orders = new NotificationChannel(
                CHANNEL_ORDERS, "Transactions Kin-Sell", NotificationManager.IMPORTANCE_HIGH);
        orders.setDescription("Commandes, marchandages et transactions");
        orders.setSound(notifSound, notifAttr);
        orders.enableVibration(true);
        orders.setVibrationPattern(new long[]{0, 300, 150, 300});
        orders.enableLights(true);
        orders.setLightColor(0xFFFF9800);
        orders.setShowBadge(true);
        orders.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);

        // ── Publications So-Kin : son notification système ──
        NotificationChannel social = new NotificationChannel(
                CHANNEL_SOCIAL, "Publications So-Kin", NotificationManager.IMPORTANCE_DEFAULT);
        social.setDescription("Nouvelles publications et interactions So-Kin");
        social.setSound(notifSound, notifAttr);
        social.enableVibration(true);
        social.setVibrationPattern(new long[]{0, 150, 100, 150});
        social.enableLights(true);
        social.setLightColor(0xFF6F58FF);
        social.setShowBadge(true);
        social.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);

        // ── Canal par défaut : son notification système ──
        NotificationChannel defaultChannel = new NotificationChannel(
                CHANNEL_DEFAULT, "Kin-Sell", NotificationManager.IMPORTANCE_HIGH);
        defaultChannel.setDescription("Notifications générales Kin-Sell");
        defaultChannel.setSound(notifSound, notifAttr);
        defaultChannel.enableVibration(true);
        defaultChannel.setVibrationPattern(new long[]{0, 250, 100, 250});
        defaultChannel.enableLights(true);
        defaultChannel.setLightColor(0xFF6F58FF);
        defaultChannel.setShowBadge(true);
        defaultChannel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);

        manager.createNotificationChannel(messages);
        manager.createNotificationChannel(calls);
        manager.createNotificationChannel(ongoingCall);
        manager.createNotificationChannel(orders);
        manager.createNotificationChannel(social);
        manager.createNotificationChannel(defaultChannel);
    }
}
