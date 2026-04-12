package com.kinsell.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/**
 * Service FCM Kin-Sell — gère les notifications entrantes avec :
 * - Canaux personnalisés (messages, appels, commandes, publications)
 * - Son, vibration et flash LED
 * - Appels entrants plein écran (écran verrouillé, comme WhatsApp)
 */
public class KinSellMessagingService extends FirebaseMessagingService {

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        // Envoyer le nouveau token au serveur immédiatement
        // (si le token est roté en background, le bridge Capacitor ne le verra pas
        //  tant que l'utilisateur n'ouvre pas l'app)
        new Thread(() -> {
            try {
                android.content.SharedPreferences prefs =
                    getSharedPreferences("kin_sell_prefs", MODE_PRIVATE);
                prefs.edit().putString("pending_fcm_token", token).apply();
            } catch (Exception ignored) {}
        }).start();
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        String type = remoteMessage.getData().get("type");
        String title = "";
        String body = "";

        // Extraire titre/body depuis notification OU data
        if (remoteMessage.getNotification() != null) {
            title = remoteMessage.getNotification().getTitle() != null
                    ? remoteMessage.getNotification().getTitle() : "";
            body = remoteMessage.getNotification().getBody() != null
                    ? remoteMessage.getNotification().getBody() : "";
        }
        // Data payload prend la priorité si présent
        if (remoteMessage.getData().containsKey("title")) {
            title = remoteMessage.getData().get("title");
        }
        if (remoteMessage.getData().containsKey("body")) {
            body = remoteMessage.getData().get("body");
        }

        if (title == null || title.isEmpty()) title = "Kin-Sell";
        if (body == null) body = "";

        if ("call".equals(type)) {
            showIncomingCallNotification(remoteMessage, title, body);
        } else {
            showStandardNotification(remoteMessage, title, body, type);
        }
    }

    /**
     * Notification d'appel entrant avec full-screen intent (écran verrouillé).
     */
    private void showIncomingCallNotification(RemoteMessage msg, String title, String body) {
        // Réveiller l'écran
        wakeScreen();

        String conversationId = msg.getData().get("conversationId");
        String callerId = msg.getData().get("callerId");
        String callType = msg.getData().get("callType");

        // Intent principal : ouvrir l'app sur la page de messaging avec l'appel
        Intent mainIntent = new Intent(this, MainActivity.class);
        mainIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        mainIntent.putExtra("type", "call");
        mainIntent.putExtra("conversationId", conversationId != null ? conversationId : "");
        mainIntent.putExtra("callerId", callerId != null ? callerId : "");
        mainIntent.putExtra("callType", callType != null ? callType : "audio");
        mainIntent.putExtra("url", "/messaging?incomingConvId=" +
                (conversationId != null ? conversationId : "") +
                "&incomingCallerId=" + (callerId != null ? callerId : "") +
                "&incomingCallType=" + (callType != null ? callType : "audio"));

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }

        PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(
                this, 0, mainIntent, flags);

        PendingIntent contentPendingIntent = PendingIntent.getActivity(
                this, 1, mainIntent, flags);

        // Vibrer manuellement (certains appareils ignorent le canal)
        vibrateForCall();

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
                this, NotificationChannels.CHANNEL_CALLS)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(body)
                .setColor(0xFF6F58FF)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setAutoCancel(true)
                .setOngoing(true)
                .setContentIntent(contentPendingIntent)
                .setFullScreenIntent(fullScreenPendingIntent, true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setDefaults(NotificationCompat.DEFAULT_ALL);

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.notify(9999, builder.build());
        }
    }

    /**
     * Notification standard (messages, commandes, publications).
     */
    private void showStandardNotification(RemoteMessage msg, String title, String body, String type) {
        String channelId = resolveChannelId(type);
        String tag = msg.getData().get("tag");

        // Intent pour ouvrir l'app
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        String url = msg.getData().get("url");
        if (url != null && !url.isEmpty()) {
            intent.putExtra("url", url);
        }
        if (type != null) intent.putExtra("type", type);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }

        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, (int) System.currentTimeMillis(), intent, flags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(body)
                .setColor(0xFF6F58FF)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setDefaults(NotificationCompat.DEFAULT_ALL);

        // Style Big Text pour les longs messages
        if (body.length() > 40) {
            builder.setStyle(new NotificationCompat.BigTextStyle().bigText(body));
        }

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            int notifId = tag != null ? tag.hashCode() : (int) System.currentTimeMillis();
            manager.notify(notifId, builder.build());
        }
    }

    private String resolveChannelId(String type) {
        if (type == null) return NotificationChannels.CHANNEL_DEFAULT;
        switch (type) {
            case "message":
                return NotificationChannels.CHANNEL_MESSAGES;
            case "call":
                return NotificationChannels.CHANNEL_CALLS;
            case "order":
            case "negotiation":
            case "stock":
                return NotificationChannels.CHANNEL_ORDERS;
            case "like":
            case "publication":
            case "sokin":
                return NotificationChannels.CHANNEL_SOCIAL;
            default:
                return NotificationChannels.CHANNEL_DEFAULT;
        }
    }

    /**
     * Réveil de l'écran pour les appels entrants.
     */
    private void wakeScreen() {
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null && !pm.isInteractive()) {
                PowerManager.WakeLock wakeLock = pm.newWakeLock(
                        PowerManager.FULL_WAKE_LOCK
                                | PowerManager.ACQUIRE_CAUSES_WAKEUP
                                | PowerManager.ON_AFTER_RELEASE,
                        "kinsell:incoming_call");
                wakeLock.acquire(30_000); // 30 secondes max
            }
        } catch (Exception e) {
            // Ignore — pas critique
        }
    }

    /**
     * Vibration manuelle pour les appels (pattern WhatsApp-like).
     */
    private void vibrateForCall() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) getSystemService(VIBRATOR_MANAGER_SERVICE);
                if (vm != null) {
                    Vibrator vibrator = vm.getDefaultVibrator();
                    vibrator.vibrate(VibrationEffect.createWaveform(
                            new long[]{0, 500, 200, 500, 200, 500, 200, 500},
                            new int[]{0, 255, 0, 255, 0, 255, 0, 255},
                            -1));
                }
            } else {
                Vibrator vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
                if (vibrator != null && vibrator.hasVibrator()) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        vibrator.vibrate(VibrationEffect.createWaveform(
                                new long[]{0, 500, 200, 500, 200, 500, 200, 500}, -1));
                    } else {
                        vibrator.vibrate(new long[]{0, 500, 200, 500, 200, 500, 200, 500}, -1);
                    }
                }
            }
        } catch (Exception e) {
            // Ignore
        }
    }
}
