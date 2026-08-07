package com.feyton.finxai.appupdate

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
// Codegen emits every spec into one package (see codegenConfig in package.json),
// which is neutral rather than nested under any one feature.
import com.feyton.finxai.specs.NativeAppUpdateSpec
import java.security.MessageDigest

/**
 * Install-permission helpers and the APK download for the in-app updater.
 *
 * Downloads go through the system DownloadManager because react-native-blob-util's
 * download-to-file path does not work: its ProgressReportingSource writes each
 * chunk to the destination file but never into the Okio sink, so the caller's
 * drain loop stops after one read and isDownloadComplete() always returns false
 * — every attempt failed with "Download interrupted." DownloadManager also
 * resumes across connection drops and survives backgrounding, which matters for
 * a ~50 MB APK on mobile data.
 */
class AppUpdateModule(reactContext: ReactApplicationContext) :
  NativeAppUpdateSpec(reactContext) {

  override fun getName(): String = NAME

  private val downloadManager: DownloadManager
    get() = reactApplicationContext.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

  /**
   * minSdk is 24, so this needs a version guard: canRequestPackageInstalls() is
   * API 26+. Below that there is no per-app permission at all — a single global
   * "Unknown sources" toggle governs, and the installer surfaces it itself — so
   * reporting "granted" is correct rather than optimistic.
   */
  override fun canInstallPackages(): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
      reactApplicationContext.packageManager.canRequestPackageInstalls()

  override fun openInstallPermissionSettings() {
    val intent =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Intent(
          Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
          Uri.parse("package:" + reactApplicationContext.packageName),
        )
      } else {
        Intent(Settings.ACTION_SECURITY_SETTINGS)
      }
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    reactApplicationContext.startActivity(intent)
  }

  override fun startDownload(url: String, fileName: String, promise: Promise) {
    try {
      // Destination is the app-specific external files dir: no storage permission
      // needed, and it is cleaned up with the app.
      val request = DownloadManager.Request(Uri.parse(url))
        .setTitle(fileName)
        .setMimeType("application/vnd.android.package-archive")
        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
        .setAllowedOverMetered(true)
        .setAllowedOverRoaming(true)
        .setDestinationInExternalFilesDir(reactApplicationContext, null, fileName)

      promise.resolve(downloadManager.enqueue(request).toDouble())
    } catch (e: Exception) {
      promise.reject("download_start_failed", e.message, e)
    }
  }

  override fun getDownloadStatus(id: Double, promise: Promise) {
    var cursor: Cursor? = null
    try {
      cursor = downloadManager.query(DownloadManager.Query().setFilterById(id.toLong()))
      val map: WritableMap = Arguments.createMap()

      if (cursor == null || !cursor.moveToFirst()) {
        // The row is gone — treat as failed rather than leaving JS polling forever.
        map.putString("status", "failed")
        map.putDouble("bytesDownloaded", 0.0)
        map.putDouble("bytesTotal", 0.0)
        map.putString("reason", "download record not found")
        promise.resolve(map)
        return
      }

      val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
      val soFar = cursor.getLong(
        cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR),
      )
      val total = cursor.getLong(
        cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES),
      )

      map.putDouble("bytesDownloaded", soFar.toDouble())
      map.putDouble("bytesTotal", total.toDouble())

      when (status) {
        DownloadManager.STATUS_PENDING -> map.putString("status", "pending")
        DownloadManager.STATUS_RUNNING -> map.putString("status", "running")
        DownloadManager.STATUS_PAUSED -> map.putString("status", "paused")
        DownloadManager.STATUS_SUCCESSFUL -> {
          map.putString("status", "success")
          downloadManager.getUriForDownloadedFile(id.toLong())?.let {
            map.putString("uri", it.toString())
          }
        }
        else -> {
          map.putString("status", "failed")
          val reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON))
          map.putString("reason", "reason $reason")
        }
      }

      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("download_status_failed", e.message, e)
    } finally {
      cursor?.close()
    }
  }

  override fun cancelDownload(id: Double) {
    try {
      downloadManager.remove(id.toLong())
    } catch (e: Exception) {
      // Best effort: a stale id is not worth surfacing.
    }
  }

  override fun sha256OfUri(uri: String, promise: Promise) {
    try {
      val digest = MessageDigest.getInstance("SHA-256")
      reactApplicationContext.contentResolver.openInputStream(Uri.parse(uri)).use { input ->
        if (input == null) {
          promise.reject("hash_failed", "could not open $uri")
          return
        }
        val buffer = ByteArray(1 shl 16)
        while (true) {
          val read = input.read(buffer)
          if (read <= 0) break
          digest.update(buffer, 0, read)
        }
      }
      promise.resolve(digest.digest().joinToString("") { "%02x".format(it) })
    } catch (e: Exception) {
      promise.reject("hash_failed", e.message, e)
    }
  }

  override fun installFromUri(uri: String, promise: Promise) {
    try {
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(Uri.parse(uri), "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      reactApplicationContext.startActivity(intent)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("install_failed", e.message, e)
    }
  }

  companion object {
    const val NAME = "AppUpdate"
  }
}
