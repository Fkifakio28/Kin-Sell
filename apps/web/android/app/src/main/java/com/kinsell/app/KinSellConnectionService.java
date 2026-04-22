package com.kinsell.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;
import androidx.core.app.NotificationCompat;

/**
 * Service de premier plan persistant — comme WhatsApp.
 *
 * Ce service empêche Android (y compris Samsung ONE UI, Xiaomi MIUI, Huawei EMUI, etc.)
 * de tuer l'app en arrière-plan. Tant que ce service tourne :
 * - L'app reste "active" dans les yeux du système
 * - Les notifications FCM arrivent sans délai
 * - Le paramètre Samsung "Suspendre activité si inutilisé" n'a aucun effet
 * - Les connexions WebSocket restent ouvertes plus longtemps
 *
 * Démarré quand l'utilisateur se connecte, arrêté quand il se déconnecte.
 */
public class KinSellConnectionService extends Service {

    public static final int NOTIFICATION_ID = 9990;
    private static final String CHANNEL_ID = "kin-sell-connection-v2";
    private static final String TAG = "KinSellConnectionSvc";
    private static final long WAKE_LOCK_TIMEOUT_MS = 4L * 60L * 60L * 1000L;
    private PowerManager.WakeLock wakeLock;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Build the persistent notification
        Intent mainIntent = new Intent(this, MainActivity.class);
        mainIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, mainIntent, piFlags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle("Kin-Sell")
                .setContentText("Connecté — notifications actives")
                .setColor(0xFF6F58FF)
                .setOngoing(true)
                .setShowWhen(false)
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setVisibility(NotificationCompat.VISIBILITY_SECRET)
                .setGroup("kin-sell-service-group")   // Isoler dans son propre groupe
                .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN) // Silencieux
                .setContentIntent(pendingIntent);

        Notification notification = builder.build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            // Android 14+ requires foreground service type
            startForeground(NOTIFICATION_ID, notification,
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        // Acquire partial wake lock to keep CPU alive for FCM/socket
        acquireWakeLock();

        // START_STICKY: Android will restart the service if killed
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        releaseWakeLock();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // User swiped app from recent apps — restart the service
        // This is how WhatsApp survives task removal
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Re-schedule with startForegroundService to survive
            Intent restartIntent = new Intent(this, KinSellConnectionService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // Android 12+ restricts background starts, but foreground services
                // with START_STICKY can restart themselves
                try {
                    startForegroundService(restartIntent);
                } catch (Exception ignored) {}
            }
        }
        super.onTaskRemoved(rootIntent);
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            android.app.NotificationChannel channel = new android.app.NotificationChannel(
                    CHANNEL_ID,
                    "Connexion Kin-Sell",
                    NotificationManager.IMPORTANCE_MIN);
            channel.setDescription("Maintient la connexion pour recevoir les messages et appels");
            channel.setSound(null, null);
            channel.enableVibration(false);
            channel.enableLights(false);
            channel.setShowBadge(false);
            // On Samsung, IMPORTANCE_MIN hides the notification from the status bar
            // but keeps the service alive
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private void acquireWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) return;
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) {
                if (wakeLock == null) {
                    wakeLock = pm.newWakeLock(
                            PowerManager.PARTIAL_WAKE_LOCK,
                            "kinsell:connection_service");
                    wakeLock.setReferenceCounted(false);
                }
                wakeLock.acquire(WAKE_LOCK_TIMEOUT_MS);
            }
        } catch (Exception e) {
            Log.w(TAG, "WakeLock acquisition failed", e);
        }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
        } catch (Exception e) {
            Log.w(TAG, "WakeLock release failed", e);
        }
    }
}
