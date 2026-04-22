package com.kinsell.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
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
    // P1 #16 : WakeLock à durée raisonnable (90 min) renouvelé périodiquement
    // plutôt qu'un long timeout unique. Android recommande < 2h par acquisition.
    private static final long WAKE_LOCK_TIMEOUT_MS = 90L * 60L * 1000L;
    private static final long WAKE_LOCK_REFRESH_MS = 75L * 60L * 1000L; // 75 min (avant expiration)
    private PowerManager.WakeLock wakeLock;
    private Handler refreshHandler;
    private Runnable refreshRunnable;

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
        // P0 #3 : NE PAS redémarrer manuellement via startForegroundService() —
        // Android 12+ interdit les background starts (ForegroundServiceStart-
        // NotAllowedException silencieuse) et certains OEM (Xiaomi/Oppo)
        // entrent alors dans une boucle kill/restart qui vide la batterie en
        // 2-3 h. On s'appuie sur :
        //   - START_STICKY (déjà retourné par onStartCommand) → Android relance
        //     naturellement le service quand il a de la RAM disponible.
        //   - FCM high_priority push → réveille le processus à chaque message
        //     entrant et rattache le socket.
        // C'est exactement le modèle utilisé par WhatsApp/Telegram.
        super.onTaskRemoved(rootIntent);
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            android.app.NotificationChannel channel = new android.app.NotificationChannel(
                    CHANNEL_ID,
                    "Connexion Kin-Sell",
                    // P2 #19 : IMPORTANCE_LOW au lieu de MIN — Samsung ONE UI
                    // ignore partiellement MIN et peut encore tuer le service.
                    // LOW garde la notif visible (mais silencieuse) comme WhatsApp,
                    // ce qui protège mieux le foreground service.
                    NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Maintient la connexion pour recevoir les messages et appels");
            channel.setSound(null, null);
            channel.enableVibration(false);
            channel.enableLights(false);
            channel.setShowBadge(false);
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
            // P1 #16 : programmer un renouvellement avant expiration pour
            // maintenir le CPU éveillé indéfiniment tant que le service vit,
            // mais avec des acquisitions courtes (90 min) respectueuses d'Android.
            scheduleWakeLockRefresh();
        } catch (Exception e) {
            Log.w(TAG, "WakeLock acquisition failed", e);
        }
    }

    private void scheduleWakeLockRefresh() {
        try {
            if (refreshHandler == null) refreshHandler = new Handler(Looper.getMainLooper());
            if (refreshRunnable != null) refreshHandler.removeCallbacks(refreshRunnable);
            refreshRunnable = () -> {
                try {
                    if (wakeLock != null) {
                        // Re-acquire étend la durée ; pas besoin de release d'abord
                        // (setReferenceCounted(false) garantit un seul hold).
                        wakeLock.acquire(WAKE_LOCK_TIMEOUT_MS);
                    }
                } catch (Exception ignored) {}
                scheduleWakeLockRefresh();
            };
            refreshHandler.postDelayed(refreshRunnable, WAKE_LOCK_REFRESH_MS);
        } catch (Exception ignored) {}
    }

    private void releaseWakeLock() {
        try {
            if (refreshHandler != null && refreshRunnable != null) {
                refreshHandler.removeCallbacks(refreshRunnable);
                refreshRunnable = null;
            }
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
        } catch (Exception e) {
            Log.w(TAG, "WakeLock release failed", e);
        }
    }
}
