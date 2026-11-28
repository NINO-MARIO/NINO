package app.nino

import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build

/** Signing-certificate helpers. Bundles and updates must be signed by the same key as the installed app. */
object AppTrust {

    @Suppress("DEPRECATION")
    fun certDer(ctx: Context): ByteArray? = try {
        val pm = ctx.packageManager
        if (Build.VERSION.SDK_INT >= 28) {
            val pi = pm.getPackageInfo(ctx.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
            pi.signingInfo?.apkContentsSigners?.firstOrNull()?.toByteArray()
        } else {
            pm.getPackageInfo(ctx.packageName, PackageManager.GET_SIGNATURES).signatures?.firstOrNull()?.toByteArray()
        }
    } catch (_: Exception) {
        null
    }

    @Suppress("DEPRECATION")
    fun archiveCertDer(ctx: Context, apkPath: String): ByteArray? = try {
        val pm = ctx.packageManager
        if (Build.VERSION.SDK_INT >= 28) {
            val pi = pm.getPackageArchiveInfo(apkPath, PackageManager.GET_SIGNING_CERTIFICATES)
            pi?.signingInfo?.apkContentsSigners?.firstOrNull()?.toByteArray()
        } else {
            pm.getPackageArchiveInfo(apkPath, PackageManager.GET_SIGNATURES)?.signatures?.firstOrNull()?.toByteArray()
        }
    } catch (_: Exception) {
        null
    }

    fun isDebuggable(ctx: Context): Boolean = (ctx.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0

    @Suppress("DEPRECATION")
    fun installedVersionCode(ctx: Context): Long = try {
        val pi = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
        if (Build.VERSION.SDK_INT >= 28) pi.longVersionCode else pi.versionCode.toLong()
    } catch (_: Exception) {
        0L
    }
}
