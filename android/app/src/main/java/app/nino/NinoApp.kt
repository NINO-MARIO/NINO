package app.nino

import android.app.ActivityManager
import android.app.Application
import android.content.Context
import android.os.Build
import android.os.Debug
import android.os.SystemClock
import android.webkit.WebView
import app.nino.core.BundleStore
import app.nino.core.RingLog
import app.nino.core.Shell
import org.json.JSONObject
import java.io.File

/** Process-wide singletons: logging, OTA bundle store, shell. Created before any activity so crashes are always captured. */
class NinoApp : Application() {

    lateinit var log: RingLog
        private set
    lateinit var store: BundleStore
        private set
    lateinit var shell: Shell
        private set

    private val startedAt = SystemClock.elapsedRealtime()

    override fun onCreate() {
        super.onCreate()
        instance = this
        log = RingLog(File(filesDir, "logs"), 2000, 512 * 1024L, 4)
        log.log(RingLog.I, "app", "start v${versionName()} sdk=${Build.VERSION.SDK_INT} ${Build.MANUFACTURER} ${Build.MODEL}")
        store = try {
            BundleStore(File(filesDir, "ota"), 12)
        } catch (e: Exception) {
            log.log(RingLog.E, "ota", "bundle store unavailable in filesDir: ${e.message}; using cacheDir")
            BundleStore(File(cacheDir, "ota"), 12)
        }
        try {
            if (store.resetIfAppChanged(AppTrust.installedVersionCode(this))) {
                log.log(RingLog.I, "ota", "app was updated: built-in UI takes over again (downloaded bundles are kept in history)")
            }
        } catch (e: Exception) {
            log.log(RingLog.W, "ota", "resetIfAppChanged failed: ${e.message}")
        }
        shell = Shell(File(filesDir, "home"), File(cacheDir, "tmp"), null, 3)
        installCrashHandler()
    }

    private fun installCrashHandler() {
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            try {
                log.log(RingLog.E, "crash", "uncaught on ${t.name}: $e")
                log.writeCrash("uncaught", e, "thread=${t.name} version=${versionName()} bundle=${store.active()} sdk=${Build.VERSION.SDK_INT} model=${Build.MODEL}")
                store.fail("native crash: ${e.javaClass.simpleName}")
            } catch (_: Throwable) {
            }
            if (previous != null) previous.uncaughtException(t, e)
        }
    }

    fun versionName(): String = try {
        packageManager.getPackageInfo(packageName, 0).versionName ?: "?"
    } catch (_: Exception) {
        "?"
    }

    fun metrics(): JSONObject {
        val o = JSONObject()
        val rt = Runtime.getRuntime()
        o.put("uptimeSec", (SystemClock.elapsedRealtime() - startedAt) / 1000)
        o.put("jvmUsedMb", (rt.totalMemory() - rt.freeMemory()) / 1048576)
        o.put("jvmMaxMb", rt.maxMemory() / 1048576)
        o.put("nativeHeapMb", Debug.getNativeHeapAllocatedSize() / 1048576)
        try {
            val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val mi = ActivityManager.MemoryInfo()
            am.getMemoryInfo(mi)
            o.put("deviceAvailMb", mi.availMem / 1048576)
            o.put("deviceLowMemory", mi.lowMemory)
        } catch (_: Exception) {
        }
        o.put("bundleBytes", store.totalBytes())
        o.put("activeBundle", store.active())
        try {
            val wv = WebView.getCurrentWebViewPackage()
            if (wv != null) o.put("webview", "${wv.packageName} ${wv.versionName}")
        } catch (_: Exception) {
        }
        val c = JSONObject()
        for ((k, v) in log.counters()) c.put(k, v)
        o.put("counters", c)
        return o
    }

    companion object {
        lateinit var instance: NinoApp
            private set
    }
}
