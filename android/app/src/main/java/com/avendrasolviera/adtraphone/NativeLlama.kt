package com.avendrasolviera.adtraphone

/**
 * JNI bindings for libadtra_inference.so (llama.cpp, CPU, arm64).
 *
 * The library binds its functions to this exact package and class name, so the names here must stay as they are.
 * All methods are static, as the library expects. Calls for one handle must not run at the same time; NinoLlm
 * serializes them. cancel() may be called from another thread while generate() runs.
 */
class NativeLlama {
    /** Receives streamed output as raw UTF-8 bytes; a multi-byte character can be split across calls. */
    fun interface Sink {
        fun onBytes(b: ByteArray)
    }

    companion object {
        init {
            System.loadLibrary("adtra_inference")
        }

        @JvmStatic
        external fun create(): Long

        /** fileType is the ggml file type (Q4_K_M = 15). The last flag is true for the app's normal load. */
        @JvmStatic
        external fun load(handle: Long, path: ByteArray, arch: ByteArray, fileType: Int, flag: Boolean)

        /**
         * Runs one chat turn. The four ints are, in order: context budget, threads, max new tokens, time limit in ms.
         * Returns the stats array that the library reports for the turn.
         */
        @JvmStatic
        external fun generate(
            handle: Long,
            roles: Array<ByteArray>,
            contents: Array<ByteArray>,
            ctx: Int,
            threads: Int,
            maxTokens: Int,
            limitMs: Int,
            temperature: Float,
            prefill: ByteArray,
            sink: Sink
        ): LongArray

        @JvmStatic
        external fun cancel(handle: Long)

        @JvmStatic
        external fun reset(handle: Long)

        @JvmStatic
        external fun unload(handle: Long)

        @JvmStatic
        external fun destroy(handle: Long)

        @JvmStatic
        external fun compatibleCpu(): Boolean

        @JvmStatic
        external fun cpuProfile(): String
    }
}
