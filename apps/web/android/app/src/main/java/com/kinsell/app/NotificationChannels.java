package com.kinsell.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

/**
 * Canaux de notification Kin-Sell v4 — sons système uniquement.
 *
 * Les IDs portent le suffixe "-v4" pour forcer Android à créer de nouveaux
 * canaux propres. Android ne permet PAS de modifier un canal après création,
 * donc tout changement de son/vibration nécessite un nouveau suffixe.
 */
public class NotificationChannels {

        // ── Nouveaux IDs v4 (reset complet — sons système garantis) ──
        public static final String CHANNEL_MESSAGES = "kin-sell-messages-v4";
        public static final String CHANNEL_CALLS = "kin-sell-calls-v4";
        public static final String CHANNEL_ONGOING_CALL = "kin-sell-ongoing-call-v4";
        public static final String CHANNEL_ORDERS = "kin-sell-orders-v4";
        public static final String CHANNEL_SOCIAL = "kin-sell-social-v4";
        public static final String CHANNEL_DEFAULT = "kin-sell-default-v4";

    // Anciens IDs à supprimer (v1 + v2)
    private static final String[] OLD_CHANNELS = {
        "kin-sell-messages", "kin-sell-calls", "kin-sell-ongoing-call",
        "kin-sell-orders", "kin-sell-social", "kin-sell-default",
        "kin-sell-connection",
                "kin-sell-messages-v2", "kin-sell-calls-v2", "kin-sell-ongoing-call-v2",
                "kin-sell-orders-v2", "kin-sell-social-v2", "kin-sell-default-v2",
                "kin-sell-messages-v3", "kin-sell-calls-v3", "kin-sell-ongoing-call-v3",
                "kin-sell-orders-v3", "kin-sell-social-v3", "kin-sell-default-v3"
    };

    public static void createChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        // P2 #20 : migration unique des anciens canaux exécutée une seule fois
        // et en thread de fond. Sur certains OEM (Huawei, Oppo), boucler sur 18
        // IDs dans le main thread peut ANR à froid.
        android.content.SharedPreferences prefs =
            context.getSharedPreferences("kin_sell_prefs", Context.MODE_PRIVATE);
        if (!prefs.getBoolean("channels_v4_migrated", false)) {
            Thread migrate = new Thread(() -> {
                try {
                    for (String oldId : OLD_CHANNELS) {
                        try {
                            if (manager.getNotificationChannel(oldId) != null) {
                                manager.deleteNotificationChannel(oldId);
                            }
                        } catch (Throwable ignored) {}
                    }
                    prefs.edit().putBoolean("channels_v4_migrated", true).apply();
                } catch (Throwable ignored) {}
            }, "ks-channels-migrate");
            migrate.setDaemon(true);
            try { migrate.start(); } catch (Throwable ignored) {}
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

        // P3 #30 : chaque canal est créé indépendamment dans un try/catch —
        // si un OEM refuse un pattern de vibration spécifique, les autres
        // canaux restent créés. En cas d'échec, on réessaie SANS vibration
        // custom (le système appliquera le pattern DEFAULT).
        createChannelSafe(manager, messages, new long[]{0, 250, 100, 250});
        createChannelSafe(manager, calls, new long[]{0, 500, 200, 500, 200, 500});
        createChannelSafe(manager, ongoingCall, null);
        createChannelSafe(manager, orders, new long[]{0, 300, 150, 300});
        createChannelSafe(manager, social, new long[]{0, 150, 100, 150});
        createChannelSafe(manager, defaultChannel, new long[]{0, 250, 100, 250});
    }

    /**
     * Crée un canal en fallback safe : si le pattern custom est refusé par
     * l'OEM, on recrée le canal sans pattern (DEFAULT système).
     */
    private static void createChannelSafe(
            NotificationManager manager,
            NotificationChannel channel,
            long[] vibrationPattern) {
        try {
            manager.createNotificationChannel(channel);
        } catch (Throwable t) {
            try {
                // Fallback : désactiver le pattern custom et retenter
                if (vibrationPattern != null) {
                    channel.setVibrationPattern(null);
                }
                manager.createNotificationChannel(channel);
            } catch (Throwable ignored) {}
        }
    }
}
