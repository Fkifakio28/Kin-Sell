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
import androidx.core.app.Person;
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
        // P1 #12 : thread daemon (ne bloque pas la JVM si SharedPrefs hang) +
        // try/catch global. Envoi immédiat au serveur si bridge Capacitor actif,
        // sinon stocké en SharedPrefs pour flush au prochain onResume.
        if (token == null || token.isEmpty()) return;
        Thread t = new Thread(() -> {
            try {
                android.content.SharedPreferences prefs =
                    getSharedPreferences("kin_sell_prefs", MODE_PRIVATE);
                prefs.edit().putString("pending_fcm_token", token).apply();
            } catch (Throwable ignored) { /* JVM shutdown ou prefs locked */ }
        }, "ks-fcm-token-persist");
        t.setDaemon(true);
        try { t.start(); } catch (Throwable ignored) {}
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        // ── Créer les canaux de notification si pas encore fait ──
        // Quand l'app est tuée, MainActivity.onCreate() n'a pas encore tourné,
        // donc les canaux n'existent pas. Sans canal, Android 8+ ignore la notif.
        NotificationChannels.createChannels(this);

        // ── P0 #1 : data peut être null (FCM n'envoie pas toujours de payload
        //    data, ex. notifs system ou topics-only). On travaille sur une Map
        //    sûre pour éviter NullPointerException.
        java.util.Map<String, String> data = remoteMessage.getData();
        if (data == null) data = java.util.Collections.emptyMap();

        String type = data.get("type");
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
        if (data.containsKey("title")) {
            title = data.get("title");
        }
        if (data.containsKey("body")) {
            body = data.get("body");
        }

        if (title == null || title.isEmpty()) title = "Kin-Sell";
        if (body == null) body = "";

        // Pas de data ET pas de notification lisible → on ignore (évite une notif vide)
        if (type == null && (title.equals("Kin-Sell") && body.isEmpty())) {
            return;
        }

        if ("call".equals(type)) {
            showIncomingCallNotification(remoteMessage, title, body);
        } else {
            showStandardNotification(remoteMessage, title, body, type);
        }
    }

    /**
     * Notification d'appel entrant avec full-screen intent + actions Accepter/Refuser.
     * Visible sur : écran verrouillé, barre d'état, panneau de notifications.
     */
    private void showIncomingCallNotification(RemoteMessage msg, String title, String body) {
        // Réveiller l'écran
        wakeScreen();

        String conversationId = msg.getData().get("conversationId");
        String callerId = msg.getData().get("callerId");
        String callType = msg.getData().get("callType");
        String callerName = msg.getData().get("callerName");
        if (conversationId == null) conversationId = "";
        if (callerId == null) callerId = "";
        if (callType == null) callType = "audio";
        if (callerName == null) callerName = title;

        // ── Persister l'appel dans SharedPreferences ──
        // Quand l'app est tuée, le WebView n'existe pas encore.
        // Au prochain onCreate(), MainActivity lira cette donnée et
        // dispatera l'appel entrant à la WebView dès qu'elle est prête.
        try {
            android.content.SharedPreferences prefs =
                getSharedPreferences("kin_sell_prefs", MODE_PRIVATE);
            prefs.edit()
                .putString("pending_incoming_call",
                    conversationId + "|" + callerId + "|" + callType + "|" + callerName)
                .putLong("pending_incoming_call_ts", System.currentTimeMillis())
                .apply();
        } catch (Exception ignored) {}

        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags |= PendingIntent.FLAG_IMMUTABLE;
        }

        // ── Intent principal : tap → ouvrir l'app sur l'écran d'appel ──
        Intent mainIntent = new Intent(this, MainActivity.class);
        mainIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        mainIntent.putExtra("type", "call");
        mainIntent.putExtra("conversationId", conversationId);
        mainIntent.putExtra("callerId", callerId);
        mainIntent.putExtra("callType", callType);
        mainIntent.putExtra("url", "/messaging?incomingConvId=" + conversationId +
                "&incomingCallerId=" + callerId +
                "&incomingCallType=" + callType);

        PendingIntent fullScreenPI = PendingIntent.getActivity(this, 0, mainIntent, piFlags);
        PendingIntent contentPI = PendingIntent.getActivity(this, 1, mainIntent, piFlags);

        // ── Action : Accepter ──
        // IMPORTANT : PendingIntent.getActivity (pas getBroadcast) pour bypasser
        // les restrictions Android 12+ sur le lancement d'activités depuis un BroadcastReceiver.
        Intent acceptIntent = new Intent(this, MainActivity.class);
        acceptIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        acceptIntent.putExtra("type", "call");
        acceptIntent.putExtra("callAction", "accept");
        acceptIntent.putExtra("conversationId", conversationId);
        acceptIntent.putExtra("callerId", callerId);
        acceptIntent.putExtra("callType", callType);
        acceptIntent.putExtra("url", "/messaging?callAction=accept&convId=" + conversationId +
                "&callerId=" + callerId + "&callType=" + callType);
        PendingIntent acceptPI = PendingIntent.getActivity(this, 2, acceptIntent, piFlags);

        // ── Action : Refuser ──
        Intent rejectIntent = new Intent(this, CallActionReceiver.class);
        rejectIntent.setAction(CallActionReceiver.ACTION_REJECT);
        rejectIntent.putExtra("conversationId", conversationId);
        rejectIntent.putExtra("callerId", callerId);
        rejectIntent.putExtra("callType", callType);
        PendingIntent rejectPI = PendingIntent.getBroadcast(this, 3, rejectIntent, piFlags);

        // Vibrer manuellement (certains appareils ignorent le canal)
        vibrateForCall();

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
                this, NotificationChannels.CHANNEL_CALLS)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(body.isEmpty() ? "Appel audio entrant" : body)
                .setSubText("Kin-Sell")
                .setColor(0xFF6F58FF)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setAutoCancel(false)
                .setOngoing(true)
                .setContentIntent(contentPI)
                .setFullScreenIntent(fullScreenPI, true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setTimeoutAfter(30_000) // Auto-dismiss après 30s
                // ── Actions visibles dans le panneau de notifications ──
                .addAction(0, "✅ Accepter", acceptPI)
                .addAction(0, "❌ Refuser", rejectPI);

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.notify(CallActionReceiver.CALL_NOTIFICATION_ID, builder.build());
        }
    }

    /**
     * Notification standard (messages, commandes, publications).
     * Messages : MessagingStyle + groupement par conversation.
     * Autres : BigText avec regroupement global.
     */
    private static final String MSG_GROUP = "kin-sell-messages-group";
    private static final int MSG_SUMMARY_ID = 9991; // ID unique pour le résumé groupé

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

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;

        int notifId = tag != null ? tag.hashCode() : (int) System.currentTimeMillis();

        if ("message".equals(type)) {
            showMessageNotification(msg, title, body, pendingIntent, manager, notifId);
        } else {
            showGenericNotification(title, body, channelId, pendingIntent, manager, notifId);
        }
    }

    /**
     * Notification de message avec MessagingStyle et groupement.
     */
    private void showMessageNotification(RemoteMessage msg, String title, String body,
                                          PendingIntent pendingIntent, NotificationManager manager, int notifId) {
        String senderName = msg.getData().get("senderName");
        if (senderName == null || senderName.isEmpty()) senderName = title;

        Person sender = new Person.Builder()
                .setName(senderName)
                .setKey(msg.getData().get("senderId"))
                .build();

        NotificationCompat.MessagingStyle style = new NotificationCompat.MessagingStyle(
                new Person.Builder().setName("Moi").build());
        style.setConversationTitle(null);     // 1-on-1 : pas de titre de conv
        style.addMessage(body, System.currentTimeMillis(), sender);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
                this, NotificationChannels.CHANNEL_MESSAGES)
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(0xFF6F58FF)
                .setStyle(style)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setGroup(MSG_GROUP);

        manager.notify(notifId, builder.build());

        // Notification résumé pour le groupement (n messages)
        NotificationCompat.Builder summary = new NotificationCompat.Builder(
                this, NotificationChannels.CHANNEL_MESSAGES)
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(0xFF6F58FF)
                .setSubText("Kin-Sell")
                .setGroup(MSG_GROUP)
                .setGroupSummary(true)
                .setAutoCancel(true)
                .setStyle(new NotificationCompat.InboxStyle()
                        .setSummaryText("Kin-Sell • Messages"))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

        manager.notify(MSG_SUMMARY_ID, summary.build());
    }

    /**
     * Notification générique (commandes, publications, etc.).
     */
    private void showGenericNotification(String title, String body, String channelId,
                                          PendingIntent pendingIntent, NotificationManager manager, int notifId) {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(body)
                .setSubText("Kin-Sell")
                .setColor(0xFF6F58FF)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

        // Style Big Text pour les longs messages
        if (body.length() > 40) {
            builder.setStyle(new NotificationCompat.BigTextStyle().bigText(body));
        }

        manager.notify(notifId, builder.build());
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
     * Utilise SCREEN_BRIGHT_WAKE_LOCK (FULL_WAKE_LOCK est déprécié depuis API 17).
     */
    @SuppressWarnings("deprecation")
    private void wakeScreen() {
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null && !pm.isInteractive()) {
                // SCREEN_BRIGHT_WAKE_LOCK + ACQUIRE_CAUSES_WAKEUP allume l'écran
                PowerManager.WakeLock wakeLock = pm.newWakeLock(
                        PowerManager.SCREEN_BRIGHT_WAKE_LOCK
                                | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                        "kinsell:incoming_call");
                wakeLock.acquire(30_000); // 30 secondes max
            }
        } catch (Exception e) {
            // Ignore — pas critique
        }
    }

    /**
     * Vibration en boucle pour les appels (pattern WhatsApp-like).
     * Repeat index = 0 → boucle jusqu'à annulation (CallActionReceiver.stopVibration).
     */
    private void vibrateForCall() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) getSystemService(VIBRATOR_MANAGER_SERVICE);
                if (vm != null) {
                    Vibrator vibrator = vm.getDefaultVibrator();
                    vibrator.vibrate(VibrationEffect.createWaveform(
                            new long[]{0, 500, 200, 500, 200, 500, 800},
                            new int[]{0, 255, 0, 255, 0, 255, 0},
                            0));
                }
            } else {
                Vibrator vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
                if (vibrator != null && vibrator.hasVibrator()) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        vibrator.vibrate(VibrationEffect.createWaveform(
                                new long[]{0, 500, 200, 500, 200, 500, 800}, 0));
                    } else {
                        vibrator.vibrate(new long[]{0, 500, 200, 500, 200, 500, 800}, 0);
                    }
                }
            }
        } catch (Exception e) {
            // Ignore
        }
    }
}
