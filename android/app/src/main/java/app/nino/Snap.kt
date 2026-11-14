package app.nino

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Rect
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.PixelCopy
import android.view.View
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

/**
 * Godview capture: copies the real on-screen pixels of the web view (PixelCopy, API 26+) and stores a
 * downscaled JPEG. Falls back to View.draw when PixelCopy is unavailable.
 */
class Snap(private val act: Activity, private val dir: File) {

    companion object {
        private const val MAX_W = 720
        private const val KEEP = 60
        private val NAME = Regex("^[A-Za-z0-9_-]{1,64}$")
    }

    init {
        dir.mkdirs()
    }

    fun take(view: View, label: String, done: (JSONObject) -> Unit) {
        val w = view.width
        val h = view.height
        if (w <= 0 || h <= 0) {
            done(JSONObject().put("error", "หน้าจอยังไม่พร้อม"))
            return
        }
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val main = Handler(Looper.getMainLooper())
        val finish = { ok: Boolean, how: String ->
            if (!ok) {
                bmp.recycle()
                done(JSONObject().put("error", "จับภาพหน้าจอไม่สำเร็จ ($how)"))
            } else {
                Thread {
                    done(save(bmp, label, how))
                }.start()
            }
        }
        if (Build.VERSION.SDK_INT >= 26) {
            try {
                val loc = IntArray(2)
                view.getLocationInWindow(loc)
                val rect = Rect(loc[0], loc[1], loc[0] + w, loc[1] + h)
                PixelCopy.request(act.window, rect, bmp, PixelCopy.OnPixelCopyFinishedListener { result ->
                    if (result == PixelCopy.SUCCESS) {
                        finish(true, "pixelcopy")
                    } else {
                        finish(drawFallback(view, bmp), "draw")
                    }
                }, main)
                return
            } catch (_: Exception) {
                // fall through to draw()
            }
        }
        finish(drawFallback(view, bmp), "draw")
    }

    private fun drawFallback(view: View, bmp: Bitmap): Boolean = try {
        view.draw(Canvas(bmp))
        true
    } catch (_: Exception) {
        false
    }

    private fun save(src: Bitmap, label: String, how: String): JSONObject {
        return try {
            val scale = if (src.width > MAX_W) MAX_W.toFloat() / src.width else 1f
            val out = if (scale < 1f) Bitmap.createScaledBitmap(src, MAX_W, (src.height * scale).toInt().coerceAtLeast(1), true) else src
            val safe = label.lowercase().replace(Regex("[^a-z0-9]+"), "-").trim('-').take(24)
            val id = "s" + System.currentTimeMillis().toString(36) + (if (safe.isNotEmpty()) "-$safe" else "")
            val f = File(dir, "$id.jpg")
            FileOutputStream(f).use { out.compress(Bitmap.CompressFormat.JPEG, 72, it) }
            val o = JSONObject()
                .put("id", id)
                .put("url", "/snaps/$id.jpg")
                .put("w", out.width)
                .put("h", out.height)
                .put("bytes", f.length())
                .put("how", how)
                .put("t", System.currentTimeMillis())
            if (out !== src) out.recycle()
            src.recycle()
            prune()
            o
        } catch (e: Exception) {
            JSONObject().put("error", "บันทึกภาพไม่สำเร็จ: ${e.message}")
        }
    }

    private fun prune() {
        val fs = dir.listFiles { f -> f.name.endsWith(".jpg") } ?: return
        if (fs.size <= KEEP) return
        fs.sortedBy { it.lastModified() }.take(fs.size - KEEP).forEach { it.delete() }
    }

    fun list(): List<JSONObject> {
        val fs = dir.listFiles { f -> f.name.endsWith(".jpg") } ?: return emptyList()
        return fs.sortedByDescending { it.lastModified() }.map {
            val id = it.name.removeSuffix(".jpg")
            JSONObject().put("id", id).put("url", "/snaps/${it.name}").put("bytes", it.length()).put("t", it.lastModified())
        }
    }

    fun delete(id: String): Boolean = NAME.matches(id) && File(dir, "$id.jpg").delete()
}
