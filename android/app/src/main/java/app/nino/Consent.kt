package app.nino

import android.app.Activity
import android.app.AlertDialog
import android.app.Dialog
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

/**
 * Native confirmation dialogs. JavaScript cannot click these, so anything dangerous (a real shell,
 * commands run on behalf of the AI) needs a human tap even if the web layer were compromised.
 */
class Consent(private val act: Activity) {

    companion object {
        const val DENY = 0
        const val ONCE = 1
        const val SESSION = 2
    }

    /** Blocks the calling (background) thread until the user answers or timeoutMs passes (= deny). */
    fun ask(title: String, body: String, offerSession: Boolean, timeoutMs: Long = 60_000L): Int {
        val latch = CountDownLatch(1)
        val answer = AtomicInteger(DENY)
        val shown = AtomicReference<Dialog?>(null)
        act.runOnUiThread {
            try {
                val b = AlertDialog.Builder(act)
                    .setTitle(title)
                    .setMessage(body)
                    .setCancelable(false)
                    .setNegativeButton("ปฏิเสธ") { _, _ -> latch.countDown() }
                    .setPositiveButton("อนุญาตครั้งนี้") { _, _ ->
                        answer.set(ONCE)
                        latch.countDown()
                    }
                if (offerSession) {
                    b.setNeutralButton("อนุญาตทั้งเซสชัน") { _, _ ->
                        answer.set(SESSION)
                        latch.countDown()
                    }
                }
                val d = b.create()
                shown.set(d)
                d.show()
            } catch (_: Exception) {
                latch.countDown()
            }
        }
        val answered = try {
            latch.await(timeoutMs, TimeUnit.MILLISECONDS)
        } catch (_: InterruptedException) {
            false
        }
        if (!answered) {
            answer.set(DENY)
            act.runOnUiThread {
                try {
                    shown.get()?.dismiss()
                } catch (_: Exception) {
                }
            }
        }
        return answer.get()
    }
}
