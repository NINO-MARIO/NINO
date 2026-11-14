package app.nino

import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import app.nino.core.BundleStore
import app.nino.core.Fetcher
import app.nino.core.HostPolicy
import app.nino.core.MiniJson
import app.nino.core.OtaCore
import app.nino.core.RingLog
import app.nino.core.Shell
import app.nino.core.Trust
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** What the bridge needs from the activity. Kept as an interface so the bridge never holds a WebView itself. */
interface BridgeHost {
    val activity: Activity
    fun reloadWeb()
    fun restartApp()
    fun snapshot(label: String, done: (JSONObject) -> Unit)
    fun markHealthy()
    fun openInstallSettings()

    /** Hides the system bars while the game is open (true) and gives them back exactly as they were (false). */
    fun setImmersive(on: Boolean)
}

private class BridgeError(msg: String, val code: String) : Exception(msg)

class NativeBridge(
    private val host: BridgeHost,
    private val vault: Vault,
    private val consent: Consent,
    private val apk: ApkUpdater,
    private val snaps: Snap
) : WebViewCompat.WebMessageListener {

    companion object {
        /**
         * Bump when a native operation is added (tools/check.js requires js/native-bridge.js to match this number).
         * 3 = "immersive" op. The web layer does NOT require it (version.js NINO_BRIDGE_API stays 2): old APKs must keep
         * getting OTA web bundles, so the web layer feature-detects the op instead.
         */
        const val BRIDGE_API = 3
    }

    private val ctx: Context get() = host.activity
    private val app: NinoApp get() = NinoApp.instance
    private val pool = Executors.newCachedThreadPool()
    private val ui = Handler(Looper.getMainLooper())
    private val jobs = ConcurrentHashMap<String, HttpURLConnection>()
    private val cancels = ConcurrentHashMap<String, AtomicBoolean>()

    @Volatile
    private var termGranted = false

    @Volatile
    private var execAlways = false
    private var logWindowStart = 0L
    private var logWindowCount = 0

    override fun onPostMessage(
        view: WebView,
        message: WebMessageCompat,
        sourceOrigin: Uri,
        isMainFrame: Boolean,
        replyProxy: JavaScriptReplyProxy
    ) {
        if (!isMainFrame || sourceOrigin.toString() != MainActivity.ORIGIN) return
        val raw = message.data ?: return
        val m = try { JSONObject(raw) } catch (e: Exception) { return }
        val id = m.optString("id")
        val send: (JSONObject) -> Unit = { o ->
            o.put("id", id)
            val s = o.toString()
            ui.post { try { replyProxy.postMessage(s) } catch (_: Exception) {} }
        }
        try {
            dispatch(m.optString("op"), m, id, send)
        } catch (e: Exception) {
            app.log.log(RingLog.E, "bridge", "op ${m.optString("op")} crashed: ${e.javaClass.simpleName}: ${e.message}")
            send(JSONObject().put("error", e.message ?: e.javaClass.simpleName))
        }
    }

    private fun done(): JSONObject = JSONObject().put("done", true)

    private fun dispatch(op: String, m: JSONObject, id: String, send: (JSONObject) -> Unit) {
        when (op) {
            "info" -> send(done().put("info", info()))
            "vault.has" -> send(done().put("has", vault.has(m.optString("name"))))
            "vault.set" -> {
                vault.set(m.optString("name"), m.optString("value"))
                send(done())
            }
            "vault.del" -> {
                vault.delete(m.optString("name"))
                send(done())
            }
            "http" -> pool.execute { http(m, id, send) }
            "cancel" -> {
                val t = m.optString("target")
                jobs.remove(t)?.disconnect()
                cancels[t]?.set(true)
                send(done())
            }

            // ---- OTA: web bundles ----
            "ota.state" -> send(done().put("state", stateJson()))
            "ota.latest" -> async(send, op) {
                val p = core(m).latestPointer()
                JSONObject().put("pointer", if (p == null) JSONObject.NULL else jv(p))
            }
            "ota.probe" -> async(send, op) {
                val i = core(m).fetchInfo(m.optString("tag"))
                JSONObject().put("info", if (i == null) JSONObject.NULL else jv(i.toMap()))
            }
            "ota.remote" -> async(send, op) { JSONObject().put("releases", jv(core(m).remote())) }
            "ota.install" -> {
                val flag = AtomicBoolean(false)
                cancels[id] = flag
                async(send, op) {
                    try {
                        val meta = core(m).install(
                            m.optString("tag"),
                            m.optBoolean("allowOlder", false),
                            OtaCore.Events { phase, d, t ->
                                send(JSONObject().put("progress", JSONObject().put("phase", phase).put("done", d).put("total", t)))
                            },
                            flag
                        )
                        app.log.incr("ota.installs")
                        app.log.log(RingLog.I, "ota", "installed ${meta.id} v${meta.version} signed=${meta.signed}")
                        if (m.optBoolean("activate", false)) {
                            app.store.activate(meta.id)
                            app.log.log(RingLog.I, "ota", "activated ${meta.id}")
                        }
                        JSONObject().put("meta", metaJson(meta)).put("state", stateJson())
                    } finally {
                        cancels.remove(id)
                    }
                }
            }
            "ota.activate" -> async(send, op) {
                app.store.activate(m.optString("bundle"))
                app.log.log(RingLog.I, "ota", "activated ${m.optString("bundle")}")
                JSONObject().put("state", stateJson())
            }
            "ota.step" -> async(send, op) {
                val dir = if (m.optInt("dir", -1) >= 0) 1 else -1
                val t = app.store.stepTarget(dir) ?: throw BridgeError("ไม่มีเวอร์ชันในทิศทางนั้นแล้ว", "end")
                app.store.activate(t)
                app.log.log(RingLog.I, "ota", "stepped ${if (dir < 0) "back" else "next"} to $t")
                JSONObject().put("active", t).put("state", stateJson())
            }
            "ota.remove" -> async(send, op) {
                app.store.remove(m.optString("bundle"))
                JSONObject().put("state", stateJson())
            }
            "ota.pin" -> async(send, op) {
                app.store.pin(m.optString("bundle"), m.optBoolean("pinned", true))
                JSONObject().put("state", stateJson())
            }
            "ota.healthy" -> {
                val target = m.optString("bundle").ifEmpty { app.store.active() }
                try { app.store.markHealthy(target) } catch (e: IOException) {
                    app.log.log(RingLog.E, "ota", "cannot persist health: ${e.message}")
                }
                host.markHealthy()
                send(done().put("state", stateJson()))
            }
            "ota.fail" -> async(send, op) {
                val t = app.store.fail(m.optString("reason", "page reported failure"))
                if (t != null) {
                    app.log.incr("ota.rollbacks")
                    app.log.log(RingLog.W, "ota", "rolled back to $t: ${m.optString("reason")}")
                }
                JSONObject().put("rolledBackTo", t ?: JSONObject.NULL).put("state", stateJson())
            }
            "app.reload" -> {
                send(done())
                ui.postDelayed({ host.reloadWeb() }, 150)
            }
            "app.restart" -> {
                send(done())
                ui.postDelayed({ host.restartApp() }, 150)
            }
            "immersive" -> {
                host.setImmersive(m.optBoolean("on", false))
                send(done())
            }

            // ---- OTA: native APK ----
            "apk.check" -> async(send, op) {
                val info = core(m).apkInfo()
                val installed = AppTrust.installedVersionCode(ctx)
                val o = JSONObject().put("installedCode", installed).put("installedName", app.versionName())
                if (info == null) {
                    o.put("apk", JSONObject.NULL)
                } else {
                    o.put("apk", jv(info)).put("newer", MiniJson.num(info, "versionCode", 0) > installed)
                }
                o
            }
            "apk.install" -> {
                val flag = AtomicBoolean(false)
                cancels[id] = flag
                async(send, op) {
                    try {
                        if (!ctx.packageManager.canRequestPackageInstalls()) {
                            host.openInstallSettings()
                            throw BridgeError("ต้องเปิดสิทธิ์ 'ติดตั้งแอปที่ไม่รู้จัก' ให้ NINO ก่อน แล้วกดอีกครั้ง", "need_permission")
                        }
                        val c = core(m)
                        val info = c.apkInfo() ?: throw BridgeError("ยังไม่มี APK ในรีลีส nino-latest", "none")
                        val code = MiniJson.num(info, "versionCode", 0)
                        if (code <= AppTrust.installedVersionCode(ctx) && !m.optBoolean("force", false)) {
                            throw BridgeError("แอปเป็นเวอร์ชันล่าสุดแล้ว", "uptodate")
                        }
                        val file = c.downloadApk(info, OtaCore.Events { phase, d, t ->
                            send(JSONObject().put("progress", JSONObject().put("phase", phase).put("done", d).put("total", t)))
                        }, flag)
                        val mine = AppTrust.certDer(ctx)
                        val theirs = AppTrust.archiveCertDer(ctx, file.path)
                        if (!Trust.sameCert(mine, theirs)) {
                            file.delete()
                            app.log.log(RingLog.E, "apk", "refused update: signing certificate differs from the installed app")
                            throw BridgeError("ลายเซ็นของ APK ใหม่ไม่ตรงกับแอปที่ติดตั้งอยู่ (ถ้าเพิ่งเปลี่ยนกุญแจ ต้องถอนการติดตั้งแล้วติดตั้งใหม่)", "cert_mismatch")
                        }
                        apk.install(file)
                        JSONObject().put("state", "awaiting_user").put("versionCode", code)
                    } finally {
                        cancels.remove(id)
                    }
                }
            }

            // ---- terminal ----
            "term.open" -> pool.execute { termOpen(send) }
            "term.attach" -> pool.execute {
                val s = app.shell.get(m.optString("sid"))
                if (s == null) {
                    send(JSONObject().put("error", "ไม่พบเซสชัน").put("code", "gone"))
                } else {
                    s.setSink(sinkFor(send))
                    send(JSONObject().put("attach", JSONObject().put("sid", s.id).put("backlog", s.backlog()).put("alive", s.alive())))
                    if (!s.alive()) send(JSONObject().put("exit", JSONObject().put("sid", s.id).put("code", s.exitCode())).put("done", true))
                }
            }
            "term.write" -> {
                val s = app.shell.get(m.optString("sid"))
                val data = m.optString("data")
                if (s == null || !s.alive()) {
                    send(JSONObject().put("error", "เซสชันจบแล้ว").put("code", "gone"))
                } else if (data.length > 16384) {
                    send(JSONObject().put("error", "ข้อความยาวเกินไป"))
                } else {
                    pool.execute {
                        try {
                            s.write(data)
                            send(done())
                        } catch (e: Exception) {
                            send(JSONObject().put("error", e.message ?: "write failed"))
                        }
                    }
                }
            }
            "term.kill" -> {
                app.shell.get(m.optString("sid"))?.kill()
                send(done())
            }
            "term.list" -> {
                val a = JSONArray()
                for (s in app.shell.list()) a.put(JSONObject().put("sid", s.id).put("alive", s.alive()))
                send(done().put("sessions", a).put("granted", termGranted))
            }
            "term.exec" -> async(send, op) { termExec(m) }

            // ---- observability ----
            "log.tail" -> async(send, op) {
                val n = m.optInt("n", 200).coerceIn(1, 500)
                val tag = m.optString("tag")
                val a = JSONArray()
                for (e in app.log.tail(n, RingLog.levelOf(m.optString("level", "D")), tag)) {
                    a.put(JSONObject().put("t", e.ts).put("l", RingLog.levelName(e.level)).put("tag", e.tag).put("msg", e.msg))
                }
                JSONObject().put("lines", a)
            }
            "log.add" -> pool.execute {
                if (logAllowed()) {
                    val tag = "js." + m.optString("tag", "app").filter { it.isLetterOrDigit() || it == '.' || it == '_' }.take(24)
                    app.log.log(RingLog.levelOf(m.optString("level", "I")), tag, m.optString("msg"))
                } else {
                    app.log.incr("log.dropped")
                }
                send(done())
            }
            "log.export" -> async(send, op) { JSONObject().put("text", app.log.export(500)) }
            "log.crash" -> async(send, op) { JSONObject().put("crash", app.log.lastCrash() ?: JSONObject.NULL) }
            "log.clearCrash" -> async(send, op) {
                app.log.clearCrashes()
                JSONObject()
            }
            "metrics" -> async(send, op) { JSONObject().put("metrics", app.metrics()) }

            // ---- godview ----
            "snap.take" -> host.snapshot(m.optString("label")) { r ->
                r.put("done", true)
                send(r)
            }
            "snap.list" -> {
                val a = JSONArray()
                for (s in snaps.list()) a.put(s)
                send(done().put("snaps", a))
            }
            "snap.del" -> send(done().put("deleted", snaps.delete(m.optString("snap"))))

            else -> send(JSONObject().put("error", "ไม่รู้จักคำสั่ง"))
        }
    }

    // ---------- helpers ----------

    /** Runs block on the pool; its JSONObject becomes the final reply (done=true), exceptions become error replies. */
    private fun async(send: (JSONObject) -> Unit, tag: String, block: () -> JSONObject) {
        pool.execute {
            try {
                val r = block()
                r.put("done", true)
                send(r)
            } catch (e: BridgeError) {
                app.log.log(RingLog.W, "bridge", "$tag: ${e.message}")
                send(JSONObject().put("error", e.message ?: "error").put("code", e.code))
            } catch (e: OtaCore.IncompatibleException) {
                app.log.log(RingLog.W, "ota", "$tag: ${e.message}")
                send(JSONObject().put("error", e.message ?: "incompatible").put("code", "incompatible"))
            } catch (e: Exception) {
                app.log.incr("bridge.errors")
                app.log.log(RingLog.W, "bridge", "$tag failed: ${e.javaClass.simpleName}: ${e.message}")
                send(JSONObject().put("error", e.message ?: e.javaClass.simpleName))
            }
        }
    }

    private fun jv(v: Any?): Any = when (v) {
        null -> JSONObject.NULL
        is Map<*, *> -> {
            val o = JSONObject()
            for ((k, x) in v) o.put(k.toString(), jv(x))
            o
        }
        is List<*> -> {
            val a = JSONArray()
            for (x in v) a.put(jv(x))
            a
        }
        else -> v
    }

    private fun core(m: JSONObject): OtaCore {
        val c = OtaCore.Config()
        val fixed = BuildConfig.NINO_REPO
        val repo = if (fixed.isNotEmpty()) fixed else m.optString("repo")
        if (repo.isEmpty()) throw BridgeError("ยังไม่ได้ตั้งค่า GitHub repo (ตั้งค่า owner/repo ก่อน)", "no_repo")
        c.repo = repo
        c.work = File(ctx.cacheDir, "ota-dl")
        c.store = app.store
        c.fetcher = Fetcher(HostPolicy.github(), "NINO/${app.versionName()}")
        c.certDer = AppTrust.certDer(ctx)
        c.requireSignature = !AppTrust.isDebuggable(ctx)
        c.bridgeApi = BRIDGE_API
        val tok = m.optString("token")
        c.token = if (tok.isEmpty()) null else tok
        return OtaCore(c)
    }

    private fun metaJson(m: BundleStore.Meta): JSONObject = JSONObject()
        .put("id", m.id).put("version", m.version).put("commit", m.commit).put("message", m.message)
        .put("builtAt", m.builtAt).put("run", m.run).put("installedAt", m.installedAt).put("size", m.size)
        .put("files", m.files).put("signed", m.signed).put("pinned", m.pinned).put("bad", m.bad)

    private fun stateJson(): JSONObject {
        val s = app.store.snapshot()
        val o = JSONObject()
        o.put("active", s.active)
        o.put("pending", s.pending ?: JSONObject.NULL)
        o.put("prev", s.prev ?: JSONObject.NULL)
        o.put("lastGood", s.lastGood ?: JSONObject.NULL)
        o.put("lastRollback", s.lastRollback ?: JSONObject.NULL)
        o.put("tries", s.tries)
        val h = JSONArray()
        for (m in s.history) h.put(metaJson(m))
        o.put("history", h)
        o.put("back", app.store.stepTarget(-1) ?: JSONObject.NULL)
        o.put("next", app.store.stepTarget(1) ?: JSONObject.NULL)
        o.put("bytes", app.store.totalBytes())
        o.put("repo", BuildConfig.NINO_REPO)
        o.put("requireSignature", !AppTrust.isDebuggable(ctx))
        return o
    }

    @Synchronized
    private fun logAllowed(): Boolean {
        val now = System.currentTimeMillis()
        if (now - logWindowStart > 5000) {
            logWindowStart = now
            logWindowCount = 0
        }
        logWindowCount++
        return logWindowCount <= 100
    }

    // ---------- terminal ----------

    private fun sinkFor(send: (JSONObject) -> Unit): Shell.Sink = object : Shell.Sink {
        override fun onOutput(sid: String, data: String) {
            send(JSONObject().put("out", JSONObject().put("sid", sid).put("data", data)))
        }

        override fun onExit(sid: String, code: Int) {
            send(JSONObject().put("exit", JSONObject().put("sid", sid).put("code", code)).put("done", true))
        }
    }

    private fun termOpen(send: (JSONObject) -> Unit) {
        try {
            if (!termGranted) {
                val r = consent.ask(
                    "เปิดเทอร์มินัลจริง?",
                    "หน้าจอ NINO ขอเปิดเชลล์ของเครื่อง (รันคำสั่งภายในพื้นที่ของแอป NINO เท่านั้น ไม่มีสิทธิ์ root)\n\nอนุญาตเฉพาะเมื่อคุณเป็นคนกดเปิดเอง",
                    false
                )
                if (r == Consent.DENY) {
                    app.log.log(RingLog.W, "term", "terminal denied by user")
                    send(JSONObject().put("error", "ผู้ใช้ปฏิเสธ").put("code", "denied"))
                    return
                }
                termGranted = true
            }
            val s = app.shell.open(sinkFor(send))
            app.log.log(RingLog.I, "term", "session ${s.id} opened")
            send(JSONObject().put("open", JSONObject().put("sid", s.id)))
        } catch (e: Exception) {
            send(JSONObject().put("error", e.message ?: "open failed"))
        }
    }

    private fun termExec(m: JSONObject): JSONObject {
        val cmd = m.optString("cmd").trim()
        if (cmd.isEmpty() || cmd.length > 4000) throw BridgeError("คำสั่งว่างหรือยาวเกินไป", "bad_cmd")
        val why = Shell.dangerous(cmd)
        if (why != null) {
            app.log.log(RingLog.W, "term", "blocked command ($why): $cmd")
            throw BridgeError("คำสั่งนี้ถูกบล็อกเพื่อความปลอดภัย: $why", "blocked")
        }
        if (!execAlways) {
            val shown = if (cmd.length > 600) cmd.substring(0, 600) + "…" else cmd
            val r = consent.ask("ให้ NINO รันคำสั่งนี้?", shown, true)
            if (r == Consent.DENY) {
                app.log.log(RingLog.W, "term", "exec denied by user: $cmd")
                throw BridgeError("ผู้ใช้ปฏิเสธการรันคำสั่ง", "denied")
            }
            if (r == Consent.SESSION) execAlways = true
        }
        app.log.log(RingLog.I, "term", "exec: $cmd")
        app.log.incr("term.exec")
        val r = app.shell.exec(cmd, m.optLong("timeoutMs", 30000L).coerceIn(1000L, 120000L), 60000)
        return JSONObject().put("code", r.code).put("out", r.out).put("timedOut", r.timedOut).put("truncated", r.truncated)
    }

    // ---------- unchanged from 2.7: info, vault, http ----------

    private fun info(): JSONObject {
        val o = JSONObject()
        o.put("package", ctx.packageName)
        o.put("sdk", Build.VERSION.SDK_INT)
        o.put("bridge", BRIDGE_API)
        o.put("bundle", app.store.active())
        o.put("repo", BuildConfig.NINO_REPO)
        o.put("debuggable", AppTrust.isDebuggable(ctx))
        o.put("versionCode", AppTrust.installedVersionCode(ctx))
        try {
            o.put("version", ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName)
            if (Build.VERSION.SDK_INT >= 28) {
                val pi = ctx.packageManager.getPackageInfo(ctx.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
                val sig = pi.signingInfo?.apkContentsSigners?.firstOrNull()
                if (sig != null) {
                    val d = MessageDigest.getInstance("SHA-256").digest(sig.toByteArray())
                    o.put("signature", d.joinToString("") { b -> "%02x".format(b) })
                }
            }
        } catch (_: Exception) {}
        return o
    }

    private fun allowed(u: URL): Boolean {
        if (u.protocol == "https") return true
        if (u.protocol != "http") return false
        return try {
            val a = InetAddress.getByName(u.host)
            a.isLoopbackAddress || a.isSiteLocalAddress || a.isLinkLocalAddress
        } catch (e: Exception) {
            false
        }
    }

    private fun http(m: JSONObject, id: String, send: (JSONObject) -> Unit) {
        var c: HttpURLConnection? = null
        app.log.incr("net.requests")
        try {
            val url = URL(m.getString("url"))
            if (!allowed(url)) {
                send(JSONObject().put("error", "นโยบายความปลอดภัยบล็อกที่อยู่นี้ (http อนุญาตเฉพาะเครื่องนี้/เครือข่ายในบ้าน)"))
                return
            }
            c = url.openConnection() as HttpURLConnection
            c.instanceFollowRedirects = false
            c.connectTimeout = 15000
            c.readTimeout = 90000
            val method = m.optString("method", "GET").uppercase()
            c.requestMethod = method
            val hs = m.optJSONObject("headers")
            if (hs != null) {
                val names = hs.keys()
                while (names.hasNext()) {
                    val k = names.next()
                    if (!k.equals("host", true) && !k.equals("authorization", true)) c.setRequestProperty(k, hs.getString(k))
                }
            }
            val av = m.optString("authVault")
            if (av.isNotEmpty()) {
                val secret = vault.get(av)
                if (secret != null) c.setRequestProperty("Authorization", "Bearer $secret")
            }
            val body = m.optString("body", "")
            if (body.isNotEmpty() && method != "GET" && method != "HEAD") {
                c.doOutput = true
                c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            jobs[id] = c
            val code = c.responseCode
            send(JSONObject().put("status", code).put("ok", code in 200..299))
            val stream = if (code in 200..299) c.inputStream else c.errorStream
            if (stream != null) {
                InputStreamReader(stream, Charsets.UTF_8).use { r ->
                    val buf = CharArray(4096)
                    while (true) {
                        val n = r.read(buf)
                        if (n < 0) break
                        app.log.incr("net.chars", n.toLong())
                        send(JSONObject().put("chunk", String(buf, 0, n)))
                    }
                }
            }
            send(JSONObject().put("done", true))
        } catch (e: Exception) {
            app.log.incr("net.errors")
            send(JSONObject().put("error", e.message ?: e.javaClass.simpleName))
        } finally {
            jobs.remove(id)
            c?.disconnect()
        }
    }
}
