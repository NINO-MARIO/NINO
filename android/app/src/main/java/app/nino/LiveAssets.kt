package app.nino

import android.content.Context
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader
import app.nino.core.BundleStore
import java.io.File
import java.io.FileInputStream
import java.util.Locale

private val MIME = mapOf(
    "html" to "text/html", "htm" to "text/html", "js" to "text/javascript", "mjs" to "text/javascript",
    "css" to "text/css", "json" to "application/json", "map" to "application/json", "txt" to "text/plain",
    "md" to "text/plain", "svg" to "image/svg+xml", "png" to "image/png", "jpg" to "image/jpeg",
    "jpeg" to "image/jpeg", "gif" to "image/gif", "webp" to "image/webp", "ico" to "image/x-icon",
    "woff" to "font/woff", "woff2" to "font/woff2", "ttf" to "font/ttf", "wasm" to "application/wasm",
    "webmanifest" to "application/manifest+json"
)

private fun mimeOf(name: String): String =
    MIME[name.substringAfterLast('.', "").lowercase(Locale.ROOT)] ?: "application/octet-stream"

private fun fileResponse(f: File): WebResourceResponse {
    val mime = mimeOf(f.name)
    val text = mime.startsWith("text/") || mime.contains("json") || mime.contains("svg")
    val headers = HashMap<String, String>()
    headers["Cache-Control"] = "no-cache"
    headers["X-Content-Type-Options"] = "nosniff"
    return WebResourceResponse(mime, if (text) "utf-8" else null, 200, "OK", headers, FileInputStream(f))
}

/**
 * Serves /app/... from the active OTA bundle on disk and falls back to the web files baked into the APK
 * (assets/web). So "builtin" is always a complete, working app and a bundle may override any subset of files.
 */
class LiveBundleHandler(ctx: Context, private val store: BundleStore) : WebViewAssetLoader.PathHandler {

    private val assets = WebViewAssetLoader.AssetsPathHandler(ctx)

    override fun handle(path: String): WebResourceResponse? {
        val rel = if (path.isEmpty() || path.endsWith("/")) path + "index.html" else path
        val f = store.resolve(rel)
        if (f != null) {
            try {
                return fileResponse(f)
            } catch (_: Exception) {
                // fall through to the built-in copy
            }
        }
        if (rel.contains("..")) return null
        return assets.handle("web/$rel")
    }
}

/** Serves Godview screenshots from files/snaps at /snaps/<name>.jpg (same origin, so canvas pixel reads work). */
class SnapHandler(private val dir: File) : WebViewAssetLoader.PathHandler {

    private val name = Regex("^[A-Za-z0-9_-]{1,64}\\.(jpg|png)$")

    override fun handle(path: String): WebResourceResponse? {
        if (!name.matches(path)) return null
        val f = File(dir, path)
        return if (f.isFile) fileResponse(f) else null
    }
}
