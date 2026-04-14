package com.kinsell.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

/**
 * Crée les canaux de notification Kin-Sell avec sons, vibrations et flash LED.
 */
public class NotificationChannels {

    public static final String CHANNEL_MESSAGES = "kin-sell-messages";
    public static final String CHANNEL_CALLS = "kin-sell-calls";
    public static final String CHANNEL_ONGOING_CALL = "kin-sell-ongoing-call";
    public static final String CHANNEL_ORDERS = "kin-sell-orders";
    public static final String CHANNEL_SOCIAL = "kin-sell-social";
    public static final String CHANNEL_DEFAULT = "kin-sell-default";

    public static void createChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        // NE PAS supprimer les canaux existants — sur Samsung, ça crée une course
        // entre la suppression et la publication de la notification, ce qui la perd.
        // Android met les canaux en cache : après la première création, les paramètres
        // (son, vibration) ne peuvent être modifiés que par l'utilisateur.

        Uri defaultSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();

        // ── Messages : haute priorité, son Kin-Sell, vibration, flash LED violet ──
        Uri messageSound = Uri.parse("android.resource://" + context.getPackageName() + "/raw/kinsell_message");
        NotificationChannel messages = new NotificationChannel(
                CHANNEL_MESSAGES, "Messages", NotificationManager.IMPORTANCE_HIGH);
        messages.setDescription("Nouveaux messages et conversations");
        messages.setSound(messageSound, audioAttributes);
        messages.enableVibration(true);
        messages.setVibrationPattern(new long[]{0, 250, 100, 250});
        messages.enableLights(true);
        messages.setLightColor(0xFF6F58FF); // Violet Kin-Sell
        messages.setShowBadge(true);

        // ── Appels : priorité maximale, sonnerie Kin-Sell, vibration longue, flash ──
        Uri callSound = Uri.parse("android.resource://" + context.getPackageName() + "/raw/kinsell_incoming_call");
        AudioAttributes ringtoneAttr = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();

        NotificationChannel calls = new NotificationChannel(
                CHANNEL_CALLS, "Appels", NotificationManager.IMPORTANCE_MAX);
        calls.setDescription("Appels audio et vidéo entrants");
        calls.setSound(callSound, ringtoneAttr);
        calls.enableVibration(true);
        calls.setVibrationPattern(new long[]{0, 500, 200, 500, 200, 500});
        calls.enableLights(true);
        calls.setLightColor(0xFF4CAF50); // Vert pour appels
        calls.setShowBadge(true);

        // ── Appel en cours : priorité basse, silencieux, persistant ──
        NotificationChannel ongoingCall = new NotificationChannel(
                CHANNEL_ONGOING_CALL, "Appel en cours", NotificationManager.IMPORTANCE_LOW);
        ongoingCall.setDescription("Notification persistante pendant un appel actif");
        ongoingCall.setSound(null, null);
        ongoingCall.enableVibration(false);
        ongoingCall.enableLights(false);
        ongoingCall.setShowBadge(false);

        // ── Commandes & Marchandages : son, vibration, flash LED orange ──
        NotificationChannel orders = new NotificationChannel(
                CHANNEL_ORDERS, "Commandes & Marchandages", NotificationManager.IMPORTANCE_HIGH);
        orders.setDescription("Commandes, marchandages et transactions");
        orders.setSound(defaultSound, audioAttributes);
        orders.enableVibration(true);
        orders.setVibrationPattern(new long[]{0, 300, 150, 300});
        orders.enableLights(true);
        orders.setLightColor(0xFFFF9800); // Orange pour transactions
        orders.setShowBadge(true);

        // ── Publications So-Kin : son, vibration légère, flash violet ──
        NotificationChannel social = new NotificationChannel(
                CHANNEL_SOCIAL, "Publications So-Kin", NotificationManager.IMPORTANCE_DEFAULT);
        social.setDescription("Nouvelles publications et interactions So-Kin");
        social.setSound(defaultSound, audioAttributes);
        social.enableVibration(true);
        social.setVibrationPattern(new long[]{0, 150, 100, 150});
        social.enableLights(true);
        social.setLightColor(0xFF6F58FF); // Violet
        social.setShowBadge(true);

        // ── Canal par défaut (falback) ──
        NotificationChannel defaultChannel = new NotificationChannel(
                CHANNEL_DEFAULT, "Kin-Sell", NotificationManager.IMPORTANCE_HIGH);
        defaultChannel.setDescription("Notifications générales Kin-Sell");
        defaultChannel.setSound(defaultSound, audioAttributes);
        defaultChannel.enableVibration(true);
        defaultChannel.setVibrationPattern(new long[]{0, 250, 100, 250});
        defaultChannel.enableLights(true);
        defaultChannel.setLightColor(0xFF6F58FF);
        defaultChannel.setShowBadge(true);

        manager.createNotificationChannel(messages);
        manager.createNotificationChannel(calls);
        manager.createNotificationChannel(ongoingCall);
        manager.createNotificationChannel(orders);
        manager.createNotificationChannel(social);
        manager.createNotificationChannel(defaultChannel);
    }
}
