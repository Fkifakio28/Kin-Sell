package com.kinsell.app;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.media.AudioManager;
import android.os.PowerManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor plugin to control audio routing (speaker vs earpiece)
 * and proximity-based screen wake lock during calls.
 */
@CapacitorPlugin(name = "AudioRoute")
public class AudioRoutePlugin extends Plugin implements SensorEventListener {

    private AudioManager audioManager;
    private SensorManager sensorManager;
    private Sensor proximitySensor;
    private PowerManager.WakeLock proximityWakeLock;
    private boolean isEarpiece = false;
    private boolean proximityActive = false;

    @Override
    public void load() {
        Context ctx = getContext();
        audioManager = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        sensorManager = (SensorManager) ctx.getSystemService(Context.SENSOR_SERVICE);
        proximitySensor = sensorManager.getDefaultSensor(Sensor.TYPE_PROXIMITY);

        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        if (pm.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) {
            proximityWakeLock = pm.newWakeLock(
                PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK,
                "kinsell:proximity"
            );
        }
    }

    /**
     * Route audio to the earpiece (phone mode).
     */
    @PluginMethod
    public void setEarpiece(PluginCall call) {
        audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        audioManager.setSpeakerphoneOn(false);
        isEarpiece = true;

        // Enable proximity sensor to turn off screen when near ear
        startProximity();

        JSObject ret = new JSObject();
        ret.put("mode", "earpiece");
        call.resolve(ret);
    }

    /**
     * Route audio to the loudspeaker.
     */
    @PluginMethod
    public void setSpeaker(PluginCall call) {
        audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        audioManager.setSpeakerphoneOn(true);
        isEarpiece = false;

        // Disable proximity sensor in speaker mode
        stopProximity();

        JSObject ret = new JSObject();
        ret.put("mode", "speaker");
        call.resolve(ret);
    }

    /**
     * Returns the current audio route.
     */
    @PluginMethod
    public void getRoute(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("mode", isEarpiece ? "earpiece" : "speaker");
        ret.put("speakerOn", audioManager.isSpeakerphoneOn());
        call.resolve(ret);
    }

    /**
     * Reset audio to normal mode (call ended).
     */
    @PluginMethod
    public void reset(PluginCall call) {
        audioManager.setMode(AudioManager.MODE_NORMAL);
        audioManager.setSpeakerphoneOn(false);
        isEarpiece = false;
        stopProximity();

        JSObject ret = new JSObject();
        ret.put("mode", "normal");
        call.resolve(ret);
    }

    // ── Proximity sensor ──

    private void startProximity() {
        if (proximityActive || proximitySensor == null) return;
        sensorManager.registerListener(this, proximitySensor, SensorManager.SENSOR_DELAY_NORMAL);
        proximityActive = true;
    }

    private void stopProximity() {
        if (!proximityActive) return;
        try { sensorManager.unregisterListener(this); } catch (Exception ignored) {}
        proximityActive = false;
        // P0 #5 : release dans try/finally pour garantir la libération du
        // WakeLock même si une exception est levée (sinon écran bloqué noir).
        try {
            if (proximityWakeLock != null && proximityWakeLock.isHeld()) {
                proximityWakeLock.release();
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        try {
            // A5 audit : null-check strict + event.values peut être vide
            // sur certains capteurs défectueux.
            if (event == null || event.sensor == null
                || event.sensor.getType() != Sensor.TYPE_PROXIMITY
                || event.values == null || event.values.length == 0
                || proximitySensor == null) return;
            float distance = event.values[0];
            boolean near = distance < proximitySensor.getMaximumRange();

            if (near && proximityWakeLock != null && !proximityWakeLock.isHeld()) {
                proximityWakeLock.acquire(10 * 60 * 1000L /* 10 min max */);
            } else if (!near && proximityWakeLock != null && proximityWakeLock.isHeld()) {
                proximityWakeLock.release();
            }
        } catch (Exception e) {
            // Sécurité : si une exception se produit ici, on relâche au cas où
            // pour éviter d'avoir un écran bloqué noir après un appel.
            try {
                if (proximityWakeLock != null && proximityWakeLock.isHeld()) {
                    proximityWakeLock.release();
                }
            } catch (Exception ignored) {}
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
        // No-op
    }

    @Override
    protected void handleOnDestroy() {
        stopProximity();
        if (audioManager != null) {
            audioManager.setMode(AudioManager.MODE_NORMAL);
            audioManager.setSpeakerphoneOn(false);
        }
    }
}
