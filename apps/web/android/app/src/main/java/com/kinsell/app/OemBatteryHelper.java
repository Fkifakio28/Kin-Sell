package com.kinsell.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

/**
 * Gère les optimisations batterie spécifiques aux fabricants Android.
 *
 * Samsung (ONE UI), Xiaomi (MIUI), Huawei (EMUI), Oppo (ColorOS),
 * Vivo (FuntouchOS), OnePlus (OxygenOS), Realme, Asus, Letv, Meizu…
 *
 * L'objectif : empêcher le système de tuer Kin-Sell en arrière-plan.
 * Chaque fabricant a ses propres paramètres de "gestion batterie" qui
 * tuent les apps non-whitelistées. Ce helper tente d'ouvrir la bonne
 * page de paramètres pour chaque fabricant.
 *
 * Référence : https://dontkillmyapp.com/
 */
public class OemBatteryHelper {

    /**
     * Tente de désactiver les restrictions batterie OEM pour cette app.
     * Lance l'intent du fabricant approprié si disponible.
     *
     * @return true si un intent a été lancé, false sinon
     */
    public static boolean requestOemBatteryExemption(Context context) {
        String manufacturer = Build.MANUFACTURER.toLowerCase();

        // Samsung ONE UI / TouchWiz
        if (manufacturer.contains("samsung")) {
            return trySamsungExemption(context);
        }

        // Xiaomi / Redmi / POCO
        if (manufacturer.contains("xiaomi") || manufacturer.contains("redmi") || manufacturer.contains("poco")) {
            return tryXiaomiExemption(context);
        }

        // Huawei / Honor
        if (manufacturer.contains("huawei") || manufacturer.contains("honor")) {
            return tryHuaweiExemption(context);
        }

        // Oppo / Realme
        if (manufacturer.contains("oppo") || manufacturer.contains("realme")) {
            return tryOppoExemption(context);
        }

        // Vivo / iQOO
        if (manufacturer.contains("vivo") || manufacturer.contains("iqoo")) {
            return tryVivoExemption(context);
        }

        // OnePlus
        if (manufacturer.contains("oneplus")) {
            return tryOnePlusExemption(context);
        }

        // Asus (ZenUI)
        if (manufacturer.contains("asus")) {
            return tryAsusExemption(context);
        }

        // Meizu
        if (manufacturer.contains("meizu")) {
            return tryMeizuExemption(context);
        }

        // Letv / LeEco
        if (manufacturer.contains("letv") || manufacturer.contains("leeco")) {
            return tryLetvExemption(context);
        }

        // Nokia (HMD)
        if (manufacturer.contains("nokia") || manufacturer.contains("hmd")) {
            return tryNokiaExemption(context);
        }

        // Infinix / Tecno / itel (Transsion)
        if (manufacturer.contains("infinix") || manufacturer.contains("tecno") || manufacturer.contains("itel")) {
            return tryTranssionExemption(context);
        }

        // Fallback: standard Android battery optimization
        return requestStandardBatteryExemption(context);
    }

    /**
     * Vérifie si l'app est déjà exemptée des optimisations batterie.
     */
    public static boolean isBatteryOptimized(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            return pm != null && !pm.isIgnoringBatteryOptimizations(context.getPackageName());
        }
        return false;
    }

    // ── Samsung ONE UI ──
    private static boolean trySamsungExemption(Context context) {
        // Samsung "Device Care" → Battery → App power management
        Intent[] intents = {
            // Samsung ONE UI 3+ "Sleeping apps" direct
            new Intent().setComponent(new ComponentName(
                "com.samsung.android.lool",
                "com.samsung.android.sm.battery.ui.BatteryActivity")),
            // Samsung Smart Manager (older)
            new Intent().setComponent(new ComponentName(
                "com.samsung.android.sm",
                "com.samsung.android.sm.battery.ui.BatteryActivity")),
            // Samsung Device Care
            new Intent().setComponent(new ComponentName(
                "com.samsung.android.lool",
                "com.samsung.android.lool.SettingsActivity")),
        };
        if (tryIntents(context, intents)) return true;
        return requestStandardBatteryExemption(context);
    }

    // ── Xiaomi / MIUI ──
    private static boolean tryXiaomiExemption(Context context) {
        Intent[] intents = {
            // MIUI Autostart
            new Intent().setComponent(new ComponentName(
                "com.miui.securitycenter",
                "com.miui.permcenter.autostart.AutoStartManagementActivity")),
            // MIUI Battery Saver
            new Intent().setComponent(new ComponentName(
                "com.miui.powerkeeper",
                "com.miui.powerkeeper.ui.HiddenAppsConfigActivity")),
        };
        if (tryIntents(context, intents)) return true;
        return requestStandardBatteryExemption(context);
    }

    // ── Huawei / EMUI ──
    private static boolean tryHuaweiExemption(Context context) {
        Intent[] intents = {
            // Huawei Phone Manager → Protected Apps
            new Intent().setComponent(new ComponentName(
                "com.huawei.systemmanager",
                "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity")),
            new Intent().setComponent(new ComponentName(
                "com.huawei.systemmanager",
                "com.huawei.systemmanager.optimize.process.ProtectActivity")),
            new Intent().setComponent(new ComponentName(
                "com.huawei.systemmanager",
                "com.huawei.systemmanager.appcontrol.activity.StartupAppControlActivity")),
        };
        if (tryIntents(context, intents)) return true;
        return requestStandardBatteryExemption(context);
    }

    // ── Oppo / ColorOS ──
    private static boolean tryOppoExemption(Context context) {
        Intent[] intents = {
            new Intent().setComponent(new ComponentName(
                "com.coloros.safecenter",
                "com.coloros.safecenter.permission.startup.StartupAppListActivity")),
            new Intent().setComponent(new ComponentName(
                "com.oppo.safe",
                "com.oppo.safe.permission.startup.StartupAppListActivity")),
            new Intent().setComponent(new ComponentName(
                "com.coloros.safecenter",
                "com.coloros.safecenter.startupapp.StartupAppListActivity")),
        };
        if (tryIntents(context, intents)) return true;
        return requestStandardBatteryExemption(context);
    }

    // ── Vivo ──
    private static boolean tryVivoExemption(Context context) {
        Intent[] intents = {
            new Intent().setComponent(new ComponentName(
                "com.vivo.permissionmanager",
                "com.vivo.permissionmanager.activity.BgStartUpManagerActivity")),
            new Intent().setComponent(new ComponentName(
                "com.iqoo.secure",
                "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager")),
        };
        if (tryIntents(context, intents)) return true;
        return requestStandardBatteryExemption(context);
    }

    // ── OnePlus ──
    private static boolean tryOnePlusExemption(Context context) {
        Intent[] intents = {
            new Intent().setComponent(new ComponentName(
                "com.oneplus.security",
                "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity")),
        };
        if (tryIntents(context, intents)) return true;
        return requestStandardBatteryExemption(context);
    }

    // ── Asus ──
    private static boolean tryAsusExemption(Context context) {
        Intent[] intents = {
            new Intent().setComponent(new ComponentName(
                "com.asus.mobilemanager",
                "com.asus.mobilemanager.autostart.AutoStartActivity")),
            new Intent().setComponent(new ComponentName(
                "com.asus.mobilemanager",
                "com.asus.mobilemanager.entry.FunctionActivity")),
        };
        if (tryIntents(context, intents)) return true;
        return requestStandardBatteryExemption(context);
    }

    // ── Meizu ──
    private static boolean tryMeizuExemption(Context context) {
        Intent[] intents = {
            new Intent("com.meizu.safe.security.SHOW_APPSEC")
                .addCategory(Intent.CATEGORY_DEFAULT)
                .putExtra("packageName", context.getPackageName()),
        };
        if (tryIntents(context, intents)) return true;
        return requestStandardBatteryExemption(context);
    }

    // ── Letv / LeEco ──
    private static boolean tryLetvExemption(Context context) {
        Intent[] intents = {
            new Intent().setComponent(new ComponentName(
                "com.letv.android.letvsafe",
                "com.letv.android.letvsafe.AutobootManageActivity")),
        };
        if (tryIntents(context, intents)) return true;
        return requestStandardBatteryExemption(context);
    }

    // ── Nokia (HMD) ──
    private static boolean tryNokiaExemption(Context context) {
        Intent[] intents = {
            new Intent().setComponent(new ComponentName(
                "com.evenwell.powersaving.g3",
                "com.evenwell.powersaving.g3.exception.PowerSaverExceptionActivity")),
        };
        if (tryIntents(context, intents)) return true;
        return requestStandardBatteryExemption(context);
    }

    // ── Infinix / Tecno / itel (Transsion) ──
    private static boolean tryTranssionExemption(Context context) {
        Intent[] intents = {
            new Intent().setComponent(new ComponentName(
                "com.transsion.phonemanager",
                "com.itel.autobootcontroller.activity.AutoBootControllerActivity")),
        };
        if (tryIntents(context, intents)) return true;
        return requestStandardBatteryExemption(context);
    }

    // ── Standard Android ──
    private static boolean requestStandardBatteryExemption(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + context.getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
                return true;
            } catch (Exception ignored) {}
        }
        return false;
    }

    /**
     * Tente de lancer chaque intent dans l'ordre. Retourne true dès le premier succès.
     */
    private static boolean tryIntents(Context context, Intent[] intents) {
        PackageManager pm = context.getPackageManager();
        for (Intent intent : intents) {
            try {
                if (intent.resolveActivity(pm) != null) {
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(intent);
                    return true;
                }
            } catch (Exception ignored) {}
        }
        return false;
    }
}
