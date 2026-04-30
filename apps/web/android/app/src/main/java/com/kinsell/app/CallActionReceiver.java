package com.kinsell.app;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.os.Build;

/**
 * BroadcastReceiver pour les actions de notification d'appel entrant.
 *
 * Gère "Accepter" et "Refuser" directement depuis la barre de notifications,
 * le panneau déployé ou l'écran verrouillé — sans que l'utilisateur doive
 * d'abord ouvrir manuellement l'app.
 */
public class CallActionReceiver extends BroadcastReceiver {

    public static final String ACTION_ACCEPT = "com.kinsell.app.CALL_ACCEPT";
    public static final String ACTION_REJECT = "com.kinsell.app.CALL_REJECT";
    public static final String ACTION_HANGUP = "com.kinsell.app.CALL_HANGUP";
    public static final int CALL_NOTIFICATION_ID = 9999;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;

        String action = intent.getAction();
        String conversationId = intent.getStringExtra("conversationId");
        String callerId = intent.getStringExtra("callerId");
        String callType = intent.getStringExtra("callType");
        String remoteUserId = intent.getStringExtra("remoteUserId");
        String callId = intent.getStringExtra("callId");
        long expiresAt = intent.getLongExtra("expiresAt", 0L);

        // 1. Fermer la notification d'appel
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(CALL_NOTIFICATION_ID);
        }

        // 2. Arrêter la vibration
        stopVibration(context);

        // 3. Ouvrir l'app avec la bonne action
        if (ACTION_ACCEPT.equals(action)) {
            // Accepter : ouvrir la page messaging avec auto-accept
            Intent mainIntent = new Intent(context, MainActivity.class);
            mainIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            mainIntent.putExtra("type", "call");
            mainIntent.putExtra("callAction", "accept");
            mainIntent.putExtra("conversationId", conversationId != null ? conversationId : "");
            mainIntent.putExtra("callerId", callerId != null ? callerId : "");
            mainIntent.putExtra("callType", callType != null ? callType : "audio");
            mainIntent.putExtra("callId", callId != null ? callId : "");
            mainIntent.putExtra("expiresAt", expiresAt);
            // Étape 3 : URL inclut callId+expiresAt pour que MessagingPage puisse
            // valider l'appel auprès du serveur avant l'auto-accept.
            String urlExtras = (callId != null && !callId.isEmpty() && expiresAt > 0L)
                    ? "&callId=" + callId + "&expiresAt=" + expiresAt
                    : "";
            mainIntent.putExtra("url", "/messaging?callAction=accept&convId=" +
                    (conversationId != null ? conversationId : "") +
                    "&callerId=" + (callerId != null ? callerId : "") +
                    "&callType=" + (callType != null ? callType : "audio") +
                    urlExtras);
            context.startActivity(mainIntent);

        } else if (ACTION_REJECT.equals(action)) {
            // Refuser : envoyer l'événement de rejet à la WebView sans ouvrir l'UI
            // L'app enregistre le rejet via un SharedPreference que MainActivity vérifiera
            // A18 audit : timestamp pour TTL 5 minutes — évite de rejouer un rejet
            // très ancien si l'app est restée tuée longtemps.
            try {
                android.content.SharedPreferences prefs =
                    context.getSharedPreferences("kin_sell_prefs", Context.MODE_PRIVATE);
                prefs.edit()
                    .putString("pending_call_reject",
                        conversationId + "|" + callerId + "|" + callType +
                        "|" + (callId != null ? callId : "") + "|" + expiresAt)
                    .putLong("pending_call_reject_ts", System.currentTimeMillis())
                    .apply();
            } catch (Exception ignored) {}

            // Si l'app est déjà ouverte, envoyer un broadcast interne
            Intent rejectIntent = new Intent("com.kinsell.app.CALL_REJECTED_INTERNAL");
            rejectIntent.setPackage(context.getPackageName());
            rejectIntent.putExtra("conversationId", conversationId);
            rejectIntent.putExtra("callerId", callerId);
            rejectIntent.putExtra("callType", callType);
            rejectIntent.putExtra("callId", callId);
            rejectIntent.putExtra("expiresAt", expiresAt);
            context.sendBroadcast(rejectIntent);

        } else if (ACTION_HANGUP.equals(action)) {
            // Raccrocher un appel en cours — retirer la notification ongoing
            if (nm != null) {
                nm.cancel(CallNotificationPlugin.ONGOING_NOTIFICATION_ID);
            }
            // Persister l'action (si l'app n'est pas encore attachée au receiver)
            try {
                android.content.SharedPreferences prefs =
                    context.getSharedPreferences("kin_sell_prefs", Context.MODE_PRIVATE);
                prefs.edit()
                    .putString("pending_call_hangup",
                        (conversationId != null ? conversationId : "") + "|" +
                        (remoteUserId != null ? remoteUserId : ""))
                    .apply();
            } catch (Exception ignored) {}
            // Broadcast interne pour que MainActivity informe le WebView (si vivante)
            Intent hangupIntent = new Intent("com.kinsell.app.CALL_HANGUP_INTERNAL");
            hangupIntent.setPackage(context.getPackageName());
            hangupIntent.putExtra("conversationId", conversationId != null ? conversationId : "");
            hangupIntent.putExtra("remoteUserId", remoteUserId != null ? remoteUserId : "");
            context.sendBroadcast(hangupIntent);
        }
    }

    private void stopVibration(Context context) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                if (vm != null) vm.getDefaultVibrator().cancel();
            } else {
                Vibrator vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
                if (vibrator != null) vibrator.cancel();
            }
        } catch (Exception ignored) {}
    }
}
