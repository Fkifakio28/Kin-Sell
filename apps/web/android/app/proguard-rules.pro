# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# ── Capacitor ──
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod <methods>;
}
-dontwarn com.getcapacitor.**

# ── Kin-Sell native plugins ──
-keep class com.kinsell.app.** { *; }
-keepclassmembers class com.kinsell.app.** { *; }

# ── Firebase / FCM ──
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# ── Cordova plugins (purchase) ──
-keep class org.apache.cordova.** { *; }
-keep class cordova.plugin.** { *; }
-keep class com.android.billingclient.** { *; }
-dontwarn org.apache.cordova.**
-dontwarn com.android.billingclient.**

# ── WebView JS interface ──
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ── Services & Receivers (instanciés par reflection par Android) ──
-keep public class * extends android.app.Service
-keep public class * extends android.content.BroadcastReceiver
-keep public class * extends android.app.Activity

# ── JSON / data classes utilisées par FCM payloads ──
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    !static !transient <fields>;
}

# ── Annotations utilisées en runtime ──
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod

# Keep line numbers for crash reports
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
