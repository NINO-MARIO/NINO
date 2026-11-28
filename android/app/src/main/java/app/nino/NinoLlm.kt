package app.nino

import android.content.Context
import com.avendrasolviera.adtraphone.NativeLlama
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.nio.CharBuffer
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

/** An error whose message is a short code (NOT_INSTALLED, CHECKSUM, ...). The web layer maps it to text. */
class LlmError(val code: String) : Exception(code)

/**
 * On-device chat model, run by llama.cpp inside libadtra_inference.so.
 * Only one model is allowed: its repo, revision, file, size and sha256 are pinned here, and a download is accepted
 * only when the size and hash match. Native calls are serialized by [lock]; stopGeneration() may run from any thread.
 */
class NinoLlm(private val ctx: Context) {
    companion object {
        const val MODEL_ID = "native_qwen25_05b_q4km"
        const val REPO = "Qwen/Qwen2.5-0.5B-Instruct-GGUF"
        const val REVISION = "9217f5db79a29953eb74d5343926648285ec7e67"
        const val FILE = "qwen2.5-0.5b-instruct-q4_k_m.gguf"
        const val BYTES = 491400032L
        const val SHA256 = "74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db"
        const val ARCH = "qwen2"
        /** ggml file type for Q4_K_M. */
        const val FILE_TYPE = 15
        /** Context budget in tokens passed to generate. */
        const val CTX = 2048
        const val MAX_TOKENS_CAP = 512
        const val TIME_LIMIT_MS = 60000
        /** Larger budget for the classroom (longOut): context, output cap and time limit. */
        const val LONG_CTX = 8192
        const val LONG_MAX_TOKENS_CAP = 1536
        const val LONG_TIME_LIMIT_MS = 240000
        private val UTF8 = StandardCharsets.UTF_8
    }

    private val lock = Any()
    @Volatile private var handle = 0L
    @Volatile private var loaded = false
    @Volatile private var generating = false

    private fun modelFile(): File = File(File(ctx.filesDir, "llm"), FILE)

    fun isInstalled(): Boolean = modelFile().let { it.isFile && it.length() == BYTES }

    private fun requireModel(id: String) {
        if (id != MODEL_ID) throw LlmError("UNKNOWN_MODEL")
    }

    /** Whether the bundled library loads on this device. */
    fun libraryOk(): Boolean = try {
        NativeLlama.compatibleCpu()
        true
    } catch (e: Throwable) {
        false
    }

    fun status(): JSONObject = JSONObject()
        .put("model", MODEL_ID)
        .put("installed", isInstalled())
        .put("loaded", loaded)
        .put("bytes", BYTES)
        .put("libraryOk", libraryOk())

    private fun allowedHost(host: String): Boolean =
        host == "huggingface.co" || host.endsWith(".huggingface.co") || host.endsWith(".hf.co")

    /** Opens the URL and follows redirects by hand, so that every host along the way is checked. */
    private fun openFollowing(start: URL): HttpURLConnection {
        var url = start
        for (hop in 0 until 6) {
            if (url.protocol != "https" || !allowedHost(url.host)) throw LlmError("DOWNLOAD_HOST")
            val c = url.openConnection() as HttpURLConnection
            c.instanceFollowRedirects = false
            c.connectTimeout = 20000
            c.readTimeout = 60000
            c.setRequestProperty("User-Agent", "NINO")
            val code = c.responseCode
            if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                val loc = c.getHeaderField("Location") ?: throw LlmError("DOWNLOAD_HTTP")
                c.disconnect()
                url = URL(url, loc)
                continue
            }
            if (code != 200) {
                c.disconnect()
                throw LlmError("DOWNLOAD_HTTP")
            }
            return c
        }
        throw LlmError("DOWNLOAD_HTTP")
    }

    /** Downloads the pinned file to a temporary name, checks size and sha256, then moves it into place. */
    fun download(model: String, cancel: AtomicBoolean, onProgress: (Int) -> Unit) {
        requireModel(model)
        if (isInstalled()) {
            onProgress(100)
            return
        }
        val target = modelFile()
        target.parentFile?.mkdirs()
        val part = File(target.parentFile, "$FILE.part")
        part.delete()
        val conn = openFollowing(URL("https://huggingface.co/$REPO/resolve/$REVISION/$FILE"))
        val digest = MessageDigest.getInstance("SHA-256")
        var got = 0L
        try {
            conn.inputStream.use { input ->
                FileOutputStream(part).use { out ->
                    val buf = ByteArray(64 * 1024)
                    var last = -1
                    while (true) {
                        if (cancel.get()) throw LlmError("CANCELLED")
                        val n = input.read(buf)
                        if (n < 0) break
                        out.write(buf, 0, n)
                        digest.update(buf, 0, n)
                        got += n
                        val pct = (got * 100 / BYTES).toInt().coerceAtMost(99)
                        if (pct != last) {
                            last = pct
                            onProgress(pct)
                        }
                    }
                }
            }
        } catch (e: Exception) {
            part.delete()
            throw e
        } finally {
            conn.disconnect()
        }
        val hex = digest.digest().joinToString("") { String.format("%02x", it.toInt() and 0xff) }
        if (got != BYTES || hex != SHA256) {
            part.delete()
            throw LlmError("CHECKSUM")
        }
        if (!part.renameTo(target)) {
            part.delete()
            throw LlmError("STORAGE")
        }
        onProgress(100)
    }

    /** Loads the installed file into a native handle. */
    fun load(model: String) {
        requireModel(model)
        if (!isInstalled()) throw LlmError("NOT_INSTALLED")
        synchronized(lock) {
            if (handle == 0L) handle = NativeLlama.create()
            if (loaded) NativeLlama.unload(handle)
            NativeLlama.reset(handle)
            NativeLlama.load(
                handle,
                modelFile().absolutePath.toByteArray(UTF8),
                ARCH.toByteArray(UTF8),
                FILE_TYPE,
                true
            )
            loaded = true
        }
    }

    /**
     * Runs one chat turn. messages is [{role, content}, ...]. onChunk gets text as it is produced.
     * Returns { stats: [...] } from the library.
     */
    fun chat(
        model: String,
        messages: JSONArray,
        maxTokens: Int,
        temperature: Double,
        longOut: Boolean,
        cancel: AtomicBoolean,
        onChunk: (String) -> Unit
    ): JSONObject {
        requireModel(model)
        if (messages.length() == 0) throw LlmError("INVALID_INPUT")
        synchronized(lock) {
            if (!loaded || handle == 0L) throw LlmError("NOT_LOADED")
            val n = messages.length()
            val roles = Array(n) { messages.getJSONObject(it).optString("role", "user").toByteArray(UTF8) }
            val contents = Array(n) { messages.getJSONObject(it).optString("content", "").toByteArray(UTF8) }
            val threads = Runtime.getRuntime().availableProcessors().coerceIn(2, 4)
            val stream = Utf8Stream(onChunk)
            val sink = NativeLlama.Sink { b -> if (!cancel.get()) stream.push(b) }
            generating = true
            val stats = try {
                NativeLlama.generate(
                    handle, roles, contents,
                    if (longOut) LONG_CTX else CTX, threads,
                    maxTokens.coerceIn(1, if (longOut) LONG_MAX_TOKENS_CAP else MAX_TOKENS_CAP),
                    if (longOut) LONG_TIME_LIMIT_MS else TIME_LIMIT_MS,
                    temperature.toFloat().coerceIn(0f, 1.5f), ByteArray(0), sink
                )
            } finally {
                generating = false
            }
            stream.finish()
            if (cancel.get()) throw LlmError("CANCELLED")
            return JSONObject().put("stats", JSONArray(stats.toList()))
        }
    }

    /** Asks the library to stop the turn that is running, if any. Safe to call from any thread. */
    fun stopGeneration() {
        val h = handle
        if (generating && h != 0L) NativeLlama.cancel(h)
    }

    fun unload() {
        synchronized(lock) {
            if (loaded && handle != 0L) NativeLlama.unload(handle)
            loaded = false
        }
    }

    /**
     * Decodes streamed bytes into text. A character split across two callbacks is kept until the rest arrives.
     */
    private class Utf8Stream(private val emit: (String) -> Unit) {
        private val dec = StandardCharsets.UTF_8.newDecoder()
            .onMalformedInput(CodingErrorAction.REPLACE)
            .onUnmappableCharacter(CodingErrorAction.REPLACE)
        private var rest = ByteArray(0)

        fun push(b: ByteArray) = run(rest + b, false)

        fun finish() {
            run(rest, true)
            rest = ByteArray(0)
        }

        private fun run(bytes: ByteArray, end: Boolean) {
            val inBuf = ByteBuffer.wrap(bytes)
            val out = CharBuffer.allocate(bytes.size + 4)
            dec.decode(inBuf, out, end)
            if (end) dec.flush(out)
            out.flip()
            if (out.hasRemaining()) emit(out.toString())
            rest = ByteArray(inBuf.remaining()).also { inBuf.get(it) }
        }
    }
}
