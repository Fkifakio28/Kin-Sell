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
 * GÃ¨re les optimisations batterie spÃ©cifiques aux fabricants Android.
 *
 * Samsung (ONE UI), Xiaomi (MIUI), Huawei (EMUI), Oppo (ColorOS),
 * Vivo (FuntouchOS), OnePlus (OxygenOS), Realme, Asus, Letv, Meizuâ€¦
 *
 * L'objectif : empÃªcher le systÃ¨me de tuer Kin-Sell en arriÃ¨re-plan.
 * Chaque fabricant a ses propres paramÃ¨tres de "gestion batterie" qui
 * tuent les apps non-whitelistÃ©es. Ce helper tente d'ouvrir la bonne
 * page de paramÃ¨tres pour chaque fabricant.
 *
 * RÃ©fÃ©rence : https://dontkillmyapp.com/
 */
public class OemBatteryHelper {

    /**
     * Tente de dÃ©sactiver les restrictions batterie OEM pour cette app.
     * TOUJOURS afficher le dialogue standard Android d'abord (fiable sur tous les appareils),
     * puis tenter l'interface OEM spÃ©cifique si disponible.
     *
     * @return true si un intent a Ã©tÃ© lancÃ©, false sinon
     */
    public static boolean requestOemBatteryExemption(Context context) {
        // 1. Toujours montrer le dialogue standard Android EN PREMIER
        //    C'est le seul qui montre un popup clair "Autoriser" / "Refuser"
        boolean standardShown = requestStandardBatteryExemption(context);

        // 2. Ensuite, tenter aussi l'interface OEM pour les restrictions supplÃ©mentaires
        //    (Samsung "Suspendre activitÃ©", Xiaomi "Autostart", etc.)
        // P2 #24 : chaque bloc OEM est wrappé dans try/catch — une erreur
        // spécifique à un fabricant ne doit jamais crasher le flow global.
        try {
            String manufacturer = Build.MANUFACTURER != null ? Build.MANUFACTURER.toLowerCase() : "";

            if (manufacturer.contains("samsung")) {
                trySamsungExemption(context);
            } else if (manufacturer.contains("xiaomi") || manufacturer.contains("redmi") || manufacturer.contains("poco")) {
                tryXiaomiExemption(context);
            } else if (manufacturer.contains("huawei") || manufacturer.contains("honor")) {
                tryHuaweiExemption(context);
            } else if (manufacturer.contains("oppo") || manufacturer.contains("realme")) {
                tryOppoExemption(context);
            } else if (manufacturer.contains("vivo") || manufacturer.contains("iqoo")) {
                tryVivoExemption(context);
            } else if (manufacturer.contains("oneplus")) {
                tryOnePlusExemption(context);
            } else if (manufacturer.contains("asus")) {
                tryAsusExemption(context);
            } else if (manufacturer.contains("meizu")) {
                tryMeizuExemption(context);
            } else if (manufacturer.contains("letv") || manufacturer.contains("leeco")) {
                tryLetvExemption(context);
            } else if (manufacturer.contains("nokia") || manufacturer.contains("hmd")) {
                tryNokiaExemption(context);
            } else if (manufacturer.contains("infinix") || manufacturer.contains("tecno") || manufacturer.contains("itel")) {
                tryTranssionExemption(context);
            }
        } catch (Throwable ignored) {
            // Fallback générique si un intent OEM est corrompu : ouvrir la liste
            // standard des apps avec optim batterie.
            try {
                Intent fallback = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(fallback);
            } catch (Throwable ignored2) {}
        }

        return standardShown;
    }

    /**
     * VÃ©rifie si l'app est dÃ©jÃ  exemptÃ©e des optimisations batterie.
     */
    public static boolean isBatteryOptimized(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            return pm != null && !pm.isIgnoringBatteryOptimizations(context.getPackageName());
        }
        return false;
    }

    // â”€â”€ Samsung ONE UI â”€â”€
    private static void trySamsungExemption(Context context) {
        // Samsung "Device Care" â†’ Battery â†’ App power management
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
        tryIntents(context, intents);
    }

    // â”€â”€ Xiaomi / MIUI â”€â”€
    private static void tryXiaomiExemption(Context context) {
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
        tryIntents(context, intents);
    }

    // â”€â”€ Huawei / EMUI â”€â”€
    private static void tryHuaweiExemption(Context context) {
        Intent[] intents = {
            // Huawei Phone Manager â†’ Protected Apps
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
        tryIntents(context, intents);
    }

    // â”€â”€ Oppo / ColorOS â”€â”€
    private static void tryOppoExemption(Context context) {
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
        tryIntents(context, intents);
    }

    // â”€â”€ Vivo â”€â”€
    private static void tryVivoExemption(Context context) {
        Intent[] intents = {
            new Intent().setComponent(new ComponentName(
                "com.vivo.permissionmanager",
                "com.vivo.permissionmanager.activity.BgStartUpManagerActivity")),
            new Intent().setComponent(new ComponentName(
                "com.iqoo.secure",
                "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager")),
        };
        tryIntents(context, intents);
    }

    // â”€â”€ OnePlus â”€â”€
    private static void tryOnePlusExemption(Context context) {
        Intent[] intents = {
            new Intent().setComponent(new ComponentName(
                "com.oneplus.security",
                "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity")),
        };
        tryIntents(context, intents);
    }

    // â”€â”€ Asus â”€â”€
    private static void tryAsusExemption(Context context) {
        Intent[] intents = {
            new Intent().setComponent(new ComponentName(
                "com.asus.mobilemanager",
                "com.asus.mobilemanager.autostart.AutoStartActivity")),
            new Intent().setComponent(new ComponentName(
                "com.asus.mobilemanager",
                "com.asus.mobilemanager.entry.FunctionActivity")),
        };
        tryIntents(context, intents);
    }

    // â”€â”€ Meizu â”€â”€
    private static void tryMeizuExemption(Context context) {
        Intent[] intents = {
            new Intent("com.meizu.safe.security.SHOW_APPSEC")
                .addCategory(Intent.CATEGORY_DEFAULT)
                .putExtra("packageName", context.getPackageName()),
        };
        tryIntents(context, intents);
    }

    // â”€â”€ Letv / LeEco â”€â”€
    private static void tryLetvExemption(Context context) {
        Intent[] intents = {
            new Intent().setComponent(new ComponentName(
                "com.letv.android.letvsafe",
                "com.letv.android.letvsafe.AutobootManageActivity")),
        };
        tryIntents(context, intents);
    }

    // â”€â”€ Nokia (HMD) â”€â”€
    private static void tryNokiaExemption(Context context) {
        Intent[] intents = {
            new Intent().setComponent(new ComponentName(
                "com.evenwell.powersaving.g3",
                "com.evenwell.powersaving.g3.exception.PowerSaverExceptionActivity")),
        };
        tryIntents(context, intents);
    }

    // â”€â”€ Infinix / Tecno / itel (Transsion) â”€â”€
    private static void tryTranssionExemption(Context context) {
        Intent[] intents = {
            new Intent().setComponent(new ComponentName(
                "com.transsion.phonemanager",
                "com.itel.autobootcontroller.activity.AutoBootControllerActivity")),
        };
        tryIntents(context, intents);
    }

    // â”€â”€ Standard Android â”€â”€
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
     * Tente de lancer chaque intent dans l'ordre. Retourne true dÃ¨s le premier succÃ¨s.
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

