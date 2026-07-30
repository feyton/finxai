package com.feyton.finxai.sms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Runs the JS task that ingests one live-captured SMS, with no Activity and no
 * UI. The handler is registered in index.js as 'FinxaiSmsTask'.
 *
 * `allowedInForeground = true` matters: an SMS can arrive while the app is open,
 * and without it the task would be silently dropped in exactly that case,
 * leaving live capture working only when the app is closed.
 */
class SmsHeadlessTaskService : HeadlessJsTaskService() {

    companion object {
        private const val TAG = "FinxaiSmsService"
        private const val CHANNEL_ID = "finxai_sms_ingest"
        private const val NOTIFICATION_ID = 4711
    }

    /**
     * SmsReceiver falls back to startForegroundService() when a background
     * startService() is refused, and Android then kills the process unless
     * startForeground() is called within a few seconds. Promoting here covers
     * that case; when started normally this is harmless — the notification is
     * posted on a MIN-importance channel, so it is silent and collapsed, and it
     * is removed as soon as the task finishes.
     */
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        try {
            promoteToForeground()
        } catch (e: Throwable) {
            // Better to run without the promotion and risk the kill than to fail
            // the ingest outright.
            Log.w(TAG, "could not promote to foreground", e)
        }
        return super.onStartCommand(intent, flags, startId)
    }

    private fun promoteToForeground() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val mgr = getSystemService(NotificationManager::class.java)
            // IMPORTANCE_MIN: no sound, no heads-up, collapsed into the shade.
            // Recording a transaction is not something to interrupt anyone for.
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Recording transactions",
                NotificationManager.IMPORTANCE_MIN,
            ).apply {
                description = "Shown briefly while FinXAI files a transaction from an SMS."
                setShowBadge(false)
            }
            mgr?.createNotificationChannel(channel)
        }

        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Recording a transaction")
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            // From API 34 a foreground service must declare its type, and it has
            // to match the android:foregroundServiceType in the manifest.
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    // Nullable Intent: that is the base class's signature in this RN version
    // (HeadlessJsTaskService.kt), and a non-null parameter overrides nothing.
    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        val extras = intent?.extras
        if (extras == null) {
            Log.w(TAG, "no extras on intent — nothing to ingest")
            return null
        }
        Log.i(TAG, "starting FinxaiSmsTask")
        return HeadlessJsTaskConfig(
            "FinxaiSmsTask",
            Arguments.fromBundle(extras),
            // Generous but bounded: the task may wait on a model round-trip
            // (12s client timeout plus one retry) before writing.
            40_000,
            true,
        )
    }
}
