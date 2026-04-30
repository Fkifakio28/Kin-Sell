package com.kinsell.app;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor plugin to control audio routing (earpiece / speaker / wired / bluetooth)
 * and proximity-based screen wake lock during calls.
 *
 * Étape 5 — routage audio réel + Bluetooth + casque filaire :
 *   - Android S+ (API 31+) : AudioManager.setCommunicationDevice(AudioDeviceInfo)
 *   - Android < S          : setSpeakerphoneOn / startBluetoothSco / stopBluetoothSco
 *   - Casque filaire (jack 3.5mm / USB-C audio) : TYPE_WIRED_HEADSET /
 *     TYPE_WIRED_HEADPHONES / TYPE_USB_HEADSET
 *   - getRoutes() expose les routes disponibles (earpiece, speaker, wired, bluetooth)
 *   - listener AudioDeviceCallback : émet "routesChanged" sur la WebView
 *     quand un casque BT ou un casque filaire se (dé)connecte pendant l'appel.
 */
@CapacitorPlugin(name = "AudioRoute")
public class AudioRoutePlugin extends Plugin implements SensorEventListener {

    private static final String ROUTE_EARPIECE = "earpiece";
    private static final String ROUTE_SPEAKER = "speaker";
    private static final String ROUTE_BLUETOOTH = "bluetooth";
    private static final String ROUTE_WIRED = "wired";

    private AudioManager audioManager;
    private SensorManager sensorManager;
    private Sensor proximitySensor;
    private PowerManager.WakeLock proximityWakeLock;

    private String currentRoute = ROUTE_EARPIECE;
    private boolean proximityActive = false;
    /** Indique si on a démarré un SCO BT en mode legacy (< S). */
    private boolean scoStarted = false;

    private AudioDeviceCallback deviceCallback;

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

        // Listener AudioDeviceCallback : disponible API 23+. Émet routesChanged
        // pour que la WebView rafraîchisse l'UI quand un casque BT (dé)connecte.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            deviceCallback = new AudioDeviceCallback() {
                @Override
                public void onAudioDevicesAdded(AudioDeviceInfo[] addedDevices) {
                    notifyListeners("routesChanged", buildRoutesPayload());
                }
                @Override
                public void onAudioDevicesRemoved(AudioDeviceInfo[] removedDevices) {
                    // Si la route Bluetooth disparaît pendant un appel, on
                    // retombe sur earpiece pour ne pas laisser l'audio muet.
                    if (currentRoute.equals(ROUTE_BLUETOOTH) && !hasBluetoothDevice()) {
                        try { applyRouteInternal(ROUTE_EARPIECE); } catch (Exception ignored) {}
                    }
                    // Si la route filaire disparaît pendant un appel (cordon
                    // débranché), idem fallback earpiece.
                    if (currentRoute.equals(ROUTE_WIRED) && !hasWiredDevice()) {
                        try { applyRouteInternal(ROUTE_EARPIECE); } catch (Exception ignored) {}
                    }
                    notifyListeners("routesChanged", buildRoutesPayload());
                }
            };
            try {
                audioManager.registerAudioDeviceCallback(deviceCallback, new Handler(Looper.getMainLooper()));
            } catch (Exception ignored) {}
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Public methods (compat étape ≤ 4)
    // ─────────────────────────────────────────────────────────────────────

    /** Public method: route audio to the earpiece (compat). */
    @PluginMethod
    public void setEarpiece(PluginCall call) {
        String effective = applyRouteInternal(ROUTE_EARPIECE);
        JSObject ret = new JSObject();
        ret.put("mode", effective);
        call.resolve(ret);
    }

    /** Public method: route audio to the loudspeaker (compat). */
    @PluginMethod
    public void setSpeaker(PluginCall call) {
        String effective = applyRouteInternal(ROUTE_SPEAKER);
        JSObject ret = new JSObject();
        ret.put("mode", effective);
        call.resolve(ret);
    }

    /** Returns the current audio route (compat). */
    @PluginMethod
    public void getRoute(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("mode", currentRoute);
        ret.put("speakerOn", audioManager != null && audioManager.isSpeakerphoneOn());
        call.resolve(ret);
    }

    /** Reset audio to normal mode (call ended). */
    @PluginMethod
    public void reset(PluginCall call) {
        clearRouting();
        JSObject ret = new JSObject();
        ret.put("mode", "normal");
        call.resolve(ret);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Étape 5 — API étendue
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Liste les routes audio disponibles + la route courante.
     * Retour: { current: "earpiece|speaker|bluetooth", available: ["earpiece","speaker","bluetooth"?] }
     */
    @PluginMethod
    public void getRoutes(PluginCall call) {
        call.resolve(buildRoutesPayload());
    }

    /**
     * Force une route audio.
     * Param: { route: "earpiece" | "speaker" | "bluetooth" }
     * Si "bluetooth" demandé sans device disponible → fallback "earpiece" + retourne fallback=true.
     */
    @PluginMethod
    public void setRoute(PluginCall call) {
        String requested = call.getString("route");
        if (requested == null) requested = ROUTE_EARPIECE;
        if (!requested.equals(ROUTE_EARPIECE)
            && !requested.equals(ROUTE_SPEAKER)
            && !requested.equals(ROUTE_BLUETOOTH)
            && !requested.equals(ROUTE_WIRED)) {
            call.reject("invalid_route");
            return;
        }
        String effective = applyRouteInternal(requested);
        JSObject ret = new JSObject();
        ret.put("mode", effective);
        ret.put("requested", requested);
        ret.put("fallback", !effective.equals(requested));
        call.resolve(ret);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Implémentation routage
    // ─────────────────────────────────────────────────────────────────────

    private JSObject buildRoutesPayload() {
        JSObject ret = new JSObject();
        ret.put("current", currentRoute);
        JSArray available = new JSArray();
        available.put(ROUTE_EARPIECE);
        available.put(ROUTE_SPEAKER);
        if (hasWiredDevice()) available.put(ROUTE_WIRED);
        if (hasBluetoothDevice()) available.put(ROUTE_BLUETOOTH);
        ret.put("available", available);
        return ret;
    }

    private boolean hasBluetoothDevice() {
        return pickBluetoothCommunicationDevice() != null || legacyBluetoothScoUsable();
    }

    /**
     * Vrai si un casque filaire (jack 3.5mm) ou un casque USB-C audio
     * communication-capable est branché. On exclut TYPE_USB_DEVICE générique
     * pour éviter les faux positifs (clés USB, hubs, etc.).
     *
     * Android S+ : on EXIGE un AudioDeviceInfo communication-capable, sinon
     * setCommunicationDevice() échouera et l'UI mentirait en proposant "Casque".
     * Android M–R : fallback possible via isWiredHeadsetOn().
     * Android < M : seul isWiredHeadsetOn() est disponible.
     */
    private boolean hasWiredDevice() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return pickWiredCommunicationDevice() != null;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            return pickWiredCommunicationDevice() != null || legacyHasWiredHeadset();
        }
        return legacyHasWiredHeadset();
    }

    private boolean legacyHasWiredHeadset() {
        if (audioManager == null) return false;
        try {
            // Plus fiable et présent depuis API 1, mais déprécié — utilisé
            // en fallback quand getDevices() ne renvoie rien d'utile (< M).
            return audioManager.isWiredHeadsetOn();
        } catch (Exception e) { return false; }
    }

    private AudioDeviceInfo pickWiredCommunicationDevice() {
        if (audioManager == null) return null;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return null;
        try {
            AudioDeviceInfo[] devices;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                java.util.List<AudioDeviceInfo> list = audioManager.getAvailableCommunicationDevices();
                devices = list != null ? list.toArray(new AudioDeviceInfo[0]) : audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
            } else {
                devices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
            }
            if (devices == null) return null;
            AudioDeviceInfo wiredHs = null, wiredHp = null, usbHs = null;
            for (AudioDeviceInfo d : devices) {
                int t = d.getType();
                if (t == AudioDeviceInfo.TYPE_WIRED_HEADSET) wiredHs = wiredHs != null ? wiredHs : d;
                else if (t == AudioDeviceInfo.TYPE_WIRED_HEADPHONES) wiredHp = wiredHp != null ? wiredHp : d;
                else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    && t == AudioDeviceInfo.TYPE_USB_HEADSET) usbHs = usbHs != null ? usbHs : d;
            }
            // Priorité aux casques avec micro (HEADSET) sur ceux sans (HEADPHONES).
            if (wiredHs != null) return wiredHs;
            if (usbHs != null) return usbHs;
            return wiredHp;
        } catch (Exception ignored) {}
        return null;
    }

    /**
     * Vrai si on peut tenter un appel via SCO BT en legacy (< S).
     * On n'expose Bluetooth que si SCO off-call est dispo ; sinon ce serait
     * une promesse fausse (A2DP seul = pas de micro pour l'appel).
     */
    private boolean legacyBluetoothScoUsable() {
        if (audioManager == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) return false;
        try { return audioManager.isBluetoothScoAvailableOffCall(); } catch (Exception e) { return false; }
    }

    /**
     * Cherche un AudioDeviceInfo Bluetooth utilisable en mode communication
     * (a un micro). Priorité : SCO > BLE_HEADSET (API 31+) > HEARING_AID.
     * A2DP est explicitement exclu : c'est media-only sans micro, l'utiliser
     * comme route d'appel donne audio mais pas de micro côté distant.
     */
    private AudioDeviceInfo pickBluetoothCommunicationDevice() {
        if (audioManager == null) return null;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return null;
        try {
            AudioDeviceInfo[] devices;
            // S+ : si dispo, utiliser getAvailableCommunicationDevices() qui
            // ne renvoie que les devices vraiment utilisables pour appel.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                java.util.List<AudioDeviceInfo> list = audioManager.getAvailableCommunicationDevices();
                devices = list != null ? list.toArray(new AudioDeviceInfo[0]) : new AudioDeviceInfo[0];
            } else {
                devices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
            }
            if (devices == null) return null;
            AudioDeviceInfo sco = null, ble = null, hearing = null;
            for (AudioDeviceInfo d : devices) {
                int t = d.getType();
                if (t == AudioDeviceInfo.TYPE_BLUETOOTH_SCO) sco = sco != null ? sco : d;
                else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                    && t == AudioDeviceInfo.TYPE_BLE_HEADSET) ble = ble != null ? ble : d;
                else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    && t == AudioDeviceInfo.TYPE_HEARING_AID) hearing = hearing != null ? hearing : d;
            }
            if (sco != null) return sco;
            if (ble != null) return ble;
            return hearing;
        } catch (Exception ignored) {}
        return null;
    }

    /**
     * Applique la route demandée et retourne la route EFFECTIVE.
     * Si bluetooth n'est pas réellement utilisable, retombe sur earpiece
     * et retourne "earpiece" pour que l'UI ne mente pas.
     */
    private String applyRouteInternal(String route) {
        if (audioManager == null) { currentRoute = route; return route; }
        try {
            audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        } catch (Exception ignored) {}

        String effective;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            effective = applyRouteAndroidS(route);
        } else {
            effective = applyRouteLegacy(route);
        }

        currentRoute = effective;

        // Proximity sensor : seulement pour earpiece (téléphone collé à l'oreille).
        if (effective.equals(ROUTE_EARPIECE)) startProximity();
        else stopProximity();

        notifyListeners("routesChanged", buildRoutesPayload());
        return effective;
    }

    /** Routage Android 12+ via setCommunicationDevice. Retourne route effective. */
    private String applyRouteAndroidS(String route) {
        try {
            AudioDeviceInfo target = pickDeviceForRoute(route);
            // Bluetooth demandé mais aucun device communication BT → fallback earpiece.
            if (route.equals(ROUTE_BLUETOOTH) && target == null) {
                AudioDeviceInfo ear = pickDeviceForRoute(ROUTE_EARPIECE);
                if (ear != null) {
                    boolean ok = audioManager.setCommunicationDevice(ear);
                    if (!ok) audioManager.clearCommunicationDevice();
                }
                return ROUTE_EARPIECE;
            }
            if (target != null) {
                boolean ok = audioManager.setCommunicationDevice(target);
                if (!ok) {
                    // L'OS a refusé → fallback earpiece.
                    AudioDeviceInfo ear = pickDeviceForRoute(ROUTE_EARPIECE);
                    if (ear != null) audioManager.setCommunicationDevice(ear);
                    return ROUTE_EARPIECE;
                }
                return route;
            }
            // Pas de device matchant pour earpiece/speaker non plus → on tente earpiece.
            AudioDeviceInfo ear = pickDeviceForRoute(ROUTE_EARPIECE);
            if (ear != null) audioManager.setCommunicationDevice(ear);
            return ROUTE_EARPIECE;
        } catch (Exception ignored) {
            // Fallback ultime sur l'API legacy.
            return applyRouteLegacy(route);
        }
    }

    private AudioDeviceInfo pickDeviceForRoute(String route) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return null;
        if (route.equals(ROUTE_BLUETOOTH)) {
            return pickBluetoothCommunicationDevice();
        }
        if (route.equals(ROUTE_WIRED)) {
            return pickWiredCommunicationDevice();
        }
        try {
            AudioDeviceInfo[] devices;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                java.util.List<AudioDeviceInfo> list = audioManager.getAvailableCommunicationDevices();
                devices = list != null ? list.toArray(new AudioDeviceInfo[0]) : audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
            } else {
                devices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
            }
            if (devices == null) return null;
            for (AudioDeviceInfo d : devices) {
                int t = d.getType();
                if (route.equals(ROUTE_SPEAKER)
                    && t == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) return d;
                if (route.equals(ROUTE_EARPIECE)
                    && t == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) return d;
            }
        } catch (Exception ignored) {}
        return null;
    }

    /** Routage Android < 12 (avant Android S). Retourne route effective. */
    private String applyRouteLegacy(String route) {
        // Réinitialise l'état SCO si on quitte Bluetooth.
        if (!route.equals(ROUTE_BLUETOOTH) && scoStarted) {
            try { audioManager.setBluetoothScoOn(false); } catch (Exception ignored) {}
            try { audioManager.stopBluetoothSco(); } catch (Exception ignored) {}
            scoStarted = false;
        }

        switch (route) {
            case ROUTE_BLUETOOTH:
                if (!legacyBluetoothScoUsable()) {
                    // Pas de SCO → on ne peut pas faire "appel BT". Fallback earpiece.
                    try { audioManager.setSpeakerphoneOn(false); } catch (Exception ignored) {}
                    return ROUTE_EARPIECE;
                }
                try { audioManager.setSpeakerphoneOn(false); } catch (Exception ignored) {}
                try {
                    audioManager.startBluetoothSco();
                    audioManager.setBluetoothScoOn(true);
                    scoStarted = true;
                    return ROUTE_BLUETOOTH;
                } catch (Exception e) {
                    // startBluetoothSco a échoué → fallback earpiece.
                    return ROUTE_EARPIECE;
                }
            case ROUTE_WIRED:
                if (!legacyHasWiredHeadset()) {
                    // Aucun casque filaire détecté → fallback earpiece.
                    try { audioManager.setSpeakerphoneOn(false); } catch (Exception ignored) {}
                    return ROUTE_EARPIECE;
                }
                // Casque filaire branché : Android route automatiquement la sortie
                // vers le jack/USB. On désactive simplement speaker + SCO BT.
                try { audioManager.setSpeakerphoneOn(false); } catch (Exception ignored) {}
                return ROUTE_WIRED;
            case ROUTE_SPEAKER:
                try { audioManager.setSpeakerphoneOn(true); } catch (Exception ignored) {}
                return ROUTE_SPEAKER;
            case ROUTE_EARPIECE:
            default:
                try { audioManager.setSpeakerphoneOn(false); } catch (Exception ignored) {}
                return ROUTE_EARPIECE;
        }
    }

    /** Reset complet en fin d'appel : libère SCO + clearCommunicationDevice + MODE_NORMAL. */
    private void clearRouting() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && audioManager != null) {
                try { audioManager.clearCommunicationDevice(); } catch (Exception ignored) {}
            }
        } catch (Exception ignored) {}
        if (scoStarted && audioManager != null) {
            try { audioManager.setBluetoothScoOn(false); } catch (Exception ignored) {}
            try { audioManager.stopBluetoothSco(); } catch (Exception ignored) {}
            scoStarted = false;
        }
        if (audioManager != null) {
            try { audioManager.setSpeakerphoneOn(false); } catch (Exception ignored) {}
            try { audioManager.setMode(AudioManager.MODE_NORMAL); } catch (Exception ignored) {}
        }
        currentRoute = ROUTE_EARPIECE;
        stopProximity();
    }

    // ─────────────────────────────────────────────────────────────────────
    // Proximity sensor
    // ─────────────────────────────────────────────────────────────────────

    private void startProximity() {
        if (proximityActive || proximitySensor == null) return;
        sensorManager.registerListener(this, proximitySensor, SensorManager.SENSOR_DELAY_NORMAL);
        proximityActive = true;
    }

    private void stopProximity() {
        if (!proximityActive) return;
        try { sensorManager.unregisterListener(this); } catch (Exception ignored) {}
        proximityActive = false;
        try {
            if (proximityWakeLock != null && proximityWakeLock.isHeld()) {
                proximityWakeLock.release();
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        try {
            if (event == null || event.sensor == null
                || event.sensor.getType() != Sensor.TYPE_PROXIMITY
                || event.values == null || event.values.length == 0
                || proximitySensor == null) return;
            float distance = event.values[0];
            boolean near = distance < proximitySensor.getMaximumRange();

            if (near && proximityWakeLock != null && !proximityWakeLock.isHeld()) {
                proximityWakeLock.acquire(10 * 60 * 1000L);
            } else if (!near && proximityWakeLock != null && proximityWakeLock.isHeld()) {
                proximityWakeLock.release();
            }
        } catch (Exception e) {
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
        if (deviceCallback != null && audioManager != null
            && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try { audioManager.unregisterAudioDeviceCallback(deviceCallback); } catch (Exception ignored) {}
        }
        clearRouting();
    }
}

