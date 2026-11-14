package app.nino

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.os.Build
import app.nino.core.RingLog
import java.io.File
import java.io.FileInputStream

/** Hands a verified APK to the system PackageInstaller. Android always asks the user to confirm the update. */
class ApkUpdater(private val ctx: Context, private val log: RingLog) {

    private val action = "${ctx.packageName}.APK_INSTALL_RESULT"
    private var registered = false

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            val status = i.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
            val msg = i.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: ""
            when (status) {
                PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                    @Suppress("DEPRECATION")
                    val confirm = i.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                    if (confirm != null) {
                        confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        try {
                            c.startActivity(confirm)
                            log.log(RingLog.I, "apk", "waiting for the user to confirm the install")
                        } catch (e: Exception) {
                            log.log(RingLog.E, "apk", "cannot open installer: ${e.message}")
                        }
                    }
                }
                PackageInstaller.STATUS_SUCCESS -> log.log(RingLog.I, "apk", "install succeeded")
                else -> {
                    log.incr("apk.install.failed")
                    log.log(RingLog.E, "apk", "install failed status=$status $msg")
                }
            }
        }
    }

    fun register() {
        if (registered) return
        val f = IntentFilter(action)
        if (Build.VERSION.SDK_INT >= 33) ctx.registerReceiver(receiver, f, Context.RECEIVER_NOT_EXPORTED)
        else ctx.registerReceiver(receiver, f)
        registered = true
    }

    fun unregister() {
        if (!registered) return
        try {
            ctx.unregisterReceiver(receiver)
        } catch (_: Exception) {
        }
        registered = false
    }

    /** Streams apk into an install session and commits it. Throws on failure to create/commit the session. */
    fun install(apk: File) {
        register()
        val installer = ctx.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        params.setAppPackageName(ctx.packageName)
        val sid = installer.createSession(params)
        val session = installer.openSession(sid)
        try {
            FileInputStream(apk).use { input ->
                session.openWrite("NINO.apk", 0, apk.length()).use { out ->
                    val buf = ByteArray(65536)
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        out.write(buf, 0, n)
                    }
                    session.fsync(out)
                }
            }
            val intent = Intent(action).setPackage(ctx.packageName)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            val pi = PendingIntent.getBroadcast(ctx, sid, intent, flags)
            session.commit(pi.intentSender)
            log.log(RingLog.I, "apk", "install session $sid committed (${apk.length()} bytes)")
        } catch (e: Exception) {
            session.abandon()
            throw e
        } finally {
            session.close()
        }
    }
}
