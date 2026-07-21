# Capacitor bridge classes are referenced through reflection and JavaScript interfaces.
-keep class com.getcapacitor.** { *; }
-dontwarn com.getcapacitor.**

# Keep the application Activity entry point.
-keep class com.foxmaybe.wangzheaccountmanager.MainActivity { *; }
