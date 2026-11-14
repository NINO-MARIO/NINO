package app.nino

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView
import app.nino.core.RingLog
import org.json.JSONObject
import java.io.File
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

class MainActivity : Activity(), BridgeHost {

    companion object {
        const val ORIGIN = "https://appassets.androidplatform.net"

        /** The UI is served from /app/: the active OTA bundle on disk, falling back to the web files baked into the APK. */
        const val START = "$ORIGIN/app/index.html"
        const val REQ_FILE = 7
        private const val HEALTH_MS = 30_000L
        private const val MAX_RENDER_DEATHS = 3

        /** How long back waits for the web layer to answer before the game stays open (the back press is consumed). */
        private const val BACK_TIMEOUT_MS = 800L

        /** Asks the game overlay to handle back. Answers "true" only when it did something (left fullscreen or closed the game). */
        private const val GAME_BACK_JS =
            "(function(){try{return !!(window.ninoOutlaw&&window.ninoOutlaw.back()===true);}catch(e){return false;}})()"
    }

    private lateinit var root: FrameLayout
    private lateinit var vault: Vault
    private lateinit var loader: WebViewAssetLoader
    private lateinit var consent: Consent
    private lateinit var apk: ApkUpdater
    private lateinit var snaps: Snap
    private var web: WebView? = null
    private var chooser: ValueCallback<Array<Uri>>? = null
    private val ui = Handler(Looper.getMainLooper())
    private val renderDeaths = ArrayList<Long>()
    private val app: NinoApp get() = NinoApp.instance

    /** The web game overlay is open (set by the "immersive" bridge op). Back and the hidden system bars follow it. */
    private var gameOpen = false

    /** A fullscreen view requested by the web page (requestFullscreen), shown above the WebView. */
    private var customView: View? = null
    private var customCallback: WebChromeClient.CustomViewCallback? = null

    /** Whether we currently hide the system bars, and the values we changed so they can be restored exactly. */
    private var immersiveOn = false
    private var savedBehavior = 0
    private var savedBackground: Drawable? = null
    private var savedCutout = 0

    override val activity: Activity get() = this

    /** A freshly activated bundle must call ota.healthy within HEALTH_MS, otherwise it is rolled back. */
    private val watchdog = Runnable {
        if (app.store.isPending) {
            val bad = app.store.active()
            app.log.log(RingLog.E, "ota", "bundle $bad sent no health signal in ${HEALTH_MS / 1000}s; rolling back")
            try { app.store.fail("no health signal within ${HEALTH_MS / 1000}s") } catch (_: Exception) {}
            app.log.incr("ota.rollbacks")
            reloadWeb()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        vault = Vault(this)
        consent = Consent(this)
        apk = ApkUpdater(this, app.log)
        apk.register()
        snaps = Snap(this, File(filesDir, "snaps"))
        loader = WebViewAssetLoader.Builder()
            .addPathHandler("/app/", LiveBundleHandler(this, app.store))
            .addPathHandler("/snaps/", SnapHandler(File(filesDir, "snaps")))
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        root = FrameLayout(this)
        setContentView(root)
        build()
        boot()
    }

    /** Counts the boot attempt (auto-rollback guard), loads the UI and arms the health watchdog. */
    private fun boot() {
        try {
            val b = app.store.beginBoot()
            if (b.rolledBack) {
                app.log.incr("ota.rollbacks")
                app.log.log(RingLog.W, "ota", "auto-rollback before boot: ${b.reason}")
            }
        } catch (e: Exception) {
            app.log.log(RingLog.E, "ota", "beginBoot failed: ${e.message}")
        }
        app.log.incr("boot.count")
        app.log.log(RingLog.I, "boot", "loading $START bundle=${app.store.active()} pending=${app.store.isPending}")
        web?.loadUrl(START)
        ui.removeCallbacks(watchdog)
        if (app.store.isPending) ui.postDelayed(watchdog, HEALTH_MS)
    }

    override fun reloadWeb() {
        runOnUiThread {
            build()
            boot()
        }
    }

    override fun markHealthy() {
        runOnUiThread { ui.removeCallbacks(watchdog) }
    }

    override fun restartApp() {
        runOnUiThread {
            app.log.log(RingLog.I, "boot", "restarting the app process")
            val i = packageManager.getLaunchIntentForPackage(packageName)
            if (i != null) {
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                startActivity(i)
            }
            finishAffinity()
            ui.postDelayed({ android.os.Process.killProcess(android.os.Process.myPid()) }, 250)
        }
    }

    override fun snapshot(label: String, done: (JSONObject) -> Unit) {
        runOnUiThread {
            val w = web
            if (w == null) done(JSONObject().put("error", "ยังไม่มีหน้าจอ")) else snaps.take(w, label, done)
        }
    }

    override fun openInstallSettings() {
        runOnUiThread {
            try {
                startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
            } catch (_: Exception) {
            }
        }
    }

    override fun setImmersive(on: Boolean) {
        runOnUiThread {
            gameOpen = on
            syncImmersive()
        }
    }

    override fun onResume() {
        super.onResume()
        syncImmersive()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        // The system brings the bars back on some transitions; re-hide them whenever we are supposed to be immersive.
        if (hasFocus) syncImmersive()
    }

    /**
     * Hides the system bars while the game is open or a web fullscreen view is up, and restores the bars,
     * the window background and the display-cutout mode exactly as they were when nothing needs them.
     * Only touches the window while the game is open, so other screens of the app are not affected.
     */
    private fun syncImmersive() {
        val want = gameOpen || customView != null
        val w = window
        val c = WindowCompat.getInsetsController(w, w.decorView)
        if (want) {
            if (!immersiveOn) {
                savedBehavior = c.systemBarsBehavior
                savedBackground = w.decorView.background
                w.setBackgroundDrawable(ColorDrawable(0xFF0D0B14.toInt()))
                if (Build.VERSION.SDK_INT >= 28) {
                    savedCutout = w.attributes.layoutInDisplayCutoutMode
                    w.attributes = w.attributes.apply {
                        layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
                    }
                }
                immersiveOn = true
            }
            c.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            c.hide(WindowInsetsCompat.Type.systemBars())
        } else if (immersiveOn) {
            immersiveOn = false
            c.show(WindowInsetsCompat.Type.systemBars())
            c.systemBarsBehavior = savedBehavior
            w.setBackgroundDrawable(savedBackground)
            savedBackground = null
            if (Build.VERSION.SDK_INT >= 28) {
                w.attributes = w.attributes.apply { layoutInDisplayCutoutMode = savedCutout }
            }
        }
    }

    /** Removes the web fullscreen view (if any) and tells the page it is gone. */
    private fun exitCustomView() {
        val v = customView ?: return
        customView = null
        root.removeView(v)
        customCallback?.onCustomViewHidden()
        customCallback = null
        web?.visibility = View.VISIBLE
        syncImmersive()
    }

    /** The page is being rebuilt or replaced: nothing from the old page (game overlay, fullscreen view) survives. */
    private fun resetPageState() {
        gameOpen = false
        exitCustomView()
        syncImmersive()
    }

    private fun build() {
        resetPageState()
        web?.let { root.removeView(it); it.destroy() }
        val w = WebView(this)
        WebView.setWebContentsDebuggingEnabled(AppTrust.isDebuggable(this))

        val s: WebSettings = w.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.allowFileAccess = false
        s.allowContentAccess = false
        s.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        s.mediaPlaybackRequiresUserGesture = false
        s.javaScriptCanOpenWindowsAutomatically = false
        s.setSupportMultipleWindows(false)
        s.setGeolocationEnabled(false)
        s.safeBrowsingEnabled = true
        w.setBackgroundColor(0xFF0D1117.toInt())

        w.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                return loader.shouldInterceptRequest(request.url)
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url
                if (u.toString().startsWith(ORIGIN)) return false
                if (u.scheme == "https") {
                    try { startActivity(Intent(Intent.ACTION_VIEW, u)) } catch (_: ActivityNotFoundException) {}
                }
                return true
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (!request.isForMainFrame) return
                app.log.incr("webview.main_frame_errors")
                app.log.log(RingLog.E, "webview", "main frame failed: ${error.errorCode} ${error.description} ${request.url}")
                if (app.store.isPending) {
                    try { app.store.fail("main frame failed to load (${error.errorCode})") } catch (_: Exception) {}
                    app.log.incr("ota.rollbacks")
                    ui.post { reloadWeb() }
                }
            }

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                app.log.incr("webview.render_gone")
                app.log.log(RingLog.E, "webview", "render process gone (crashed=${detail.didCrash()})")
                try { app.store.fail("web view process died") } catch (_: Exception) {}
                val now = SystemClock.elapsedRealtime()
                renderDeaths.add(now)
                renderDeaths.removeAll { now - it > 60_000L }
                if (renderDeaths.size > MAX_RENDER_DEATHS) {
                    app.log.log(RingLog.E, "webview", "render process keeps dying; not restarting it again")
                    root.post { showFatal("WebView หยุดทำงานซ้ำๆ\nปิดแล้วเปิดแอปใหม่ หรืออัปเดต Android System WebView") }
                } else {
                    root.post { build(); boot() }
                }
                return true
            }
        }

        w.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: WebChromeClient.FileChooserParams
            ): Boolean {
                chooser?.onReceiveValue(null)
                chooser = callback
                val i = Intent(Intent.ACTION_GET_CONTENT)
                i.addCategory(Intent.CATEGORY_OPENABLE)
                i.type = "*/*"
                if (params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                val types = params.acceptTypes?.filter { it.contains('/') }
                if (!types.isNullOrEmpty()) i.putExtra(Intent.EXTRA_MIME_TYPES, types.toTypedArray())
                return try {
                    startActivityForResult(Intent.createChooser(i, null), REQ_FILE)
                    true
                } catch (e: Exception) {
                    chooser = null
                    false
                }
            }

            override fun onShowCustomView(view: View, callback: WebChromeClient.CustomViewCallback) {
                if (customView != null) {
                    callback.onCustomViewHidden()
                    return
                }
                customView = view
                customCallback = callback
                view.setBackgroundColor(0xFF000000.toInt())
                root.addView(
                    view,
                    FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                )
                web?.visibility = View.GONE
                syncImmersive()
            }

            override fun onHideCustomView() {
                exitCustomView()
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                request.deny()
            }

            override fun onConsoleMessage(cm: ConsoleMessage): Boolean {
                val lvl = cm.messageLevel()
                if (lvl == ConsoleMessage.MessageLevel.ERROR || lvl == ConsoleMessage.MessageLevel.WARNING) {
                    val err = lvl == ConsoleMessage.MessageLevel.ERROR
                    if (err) app.log.incr("js.errors") else app.log.incr("js.warnings")
                    app.log.log(
                        if (err) RingLog.E else RingLog.W, "console",
                        "${cm.message()} (${cm.sourceId().substringAfterLast('/')}:${cm.lineNumber()})"
                    )
                }
                return false
            }
        }

        w.setDownloadListener { _, _, _, _, _ -> }

        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(w, "NinoNative", setOf(ORIGIN), NativeBridge(this, vault, consent, apk, snaps))
        }

        root.addView(
            w,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )
        web = w
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == REQ_FILE) {
            chooser?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
            chooser = null
        } else {
            super.onActivityResult(requestCode, resultCode, data)
        }
    }

    override fun onBackPressed() {
        if (customView != null) {
            exitCustomView()
            return
        }
        if (gameOpen) {
            backFromGame()
            return
        }
        normalBack()
    }

    private fun normalBack() {
        val w = web
        if (w != null && w.canGoBack()) w.goBack() else super.onBackPressed()
    }

    /**
     * While the game is open, back belongs to the game overlay: it leaves fullscreen first, then closes the game.
     * The web layer answers "true" when it handled the press. If it does not answer in time the press is consumed,
     * so the app is never closed by accident while the game is open.
     */
    private fun backFromGame() {
        val w = web
        if (w == null) {
            gameOpen = false
            syncImmersive()
            return
        }
        var answered = false
        val timeout = Runnable {
            if (!answered) {
                answered = true
                app.log.log(RingLog.W, "game", "web layer did not answer back in time; the game stays open")
            }
        }
        ui.postDelayed(timeout, BACK_TIMEOUT_MS)
        w.evaluateJavascript(GAME_BACK_JS) { r ->
            if (answered) return@evaluateJavascript
            answered = true
            ui.removeCallbacks(timeout)
            when (r) {
                "true" -> Unit
                "false" -> {
                    // the web layer has no game open, so our flag was stale
                    gameOpen = false
                    syncImmersive()
                    normalBack()
                }
                else -> app.log.log(RingLog.W, "game", "back: unexpected answer from the web layer: $r")
            }
        }
    }

    private fun showFatal(msg: String) {
        resetPageState()
        web?.let { root.removeView(it); it.destroy() }
        web = null
        val tv = TextView(this)
        tv.text = msg
        tv.setTextColor(0xFFE6EDF3.toInt())
        tv.setBackgroundColor(0xFF0D1117.toInt())
        tv.textSize = 16f
        tv.setPadding(48, 96, 48, 48)
        root.addView(tv, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    }

    override fun onDestroy() {
        ui.removeCallbacks(watchdog)
        apk.unregister()
        web?.destroy()
        super.onDestroy()
    }
}
