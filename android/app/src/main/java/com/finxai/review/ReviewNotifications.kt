package com.feyton.finxai.review

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.RemoteInput
import com.feyton.finxai.R

/**
 * Builds the review-question notification and its outcomes. Shared by
 * ReviewNotifierModule (JS asks / settles) and ReviewReplyReceiver (the user
 * answered), so the notification is defined in exactly one place.
 */
object ReviewNotifications {
    const val CHANNEL_ID = "finxai_review_questions"
    const val ACTION_CONFIRM = "com.feyton.finxai.review.CONFIRM"
    const val ACTION_DESCRIBE = "com.feyton.finxai.review.DESCRIBE"
    const val EXTRA_RECORD_ID = "recordId"
    const val KEY_NOTE = "note"

    /** Stable per record, so a re-ask replaces rather than stacks. */
    fun idFor(recordId: String): Int = ("review:$recordId").hashCode()

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val mgr = context.getSystemService(NotificationManager::class.java) ?: return
        // DEFAULT, not HIGH: it should be there when you look, with one sound —
        // not a heads-up over whatever you are doing at the till. Users can raise
        // it per channel if they want it louder.
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Quick questions about payments",
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description =
                "When FinXAI isn't sure what a payment was, it asks right after it happens."
        }
        mgr.createNotificationChannel(channel)
    }

    /**
     * Tap target: the pending record itself (finxai://review/<id>, pinned to the
     * top of the queue) while it is a question, the filed transaction
     * (finxai://txn/<id>, its detail sheet) once answered. Both are routes in
     * App.tsx's LINKING, with Home beneath them.
     */
    private fun open(context: Context, recordId: String, filed: Boolean): PendingIntent {
        val path = if (filed) "txn" else "review"
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("finxai://$path/${Uri.encode(recordId)}"))
            .setPackage(context.packageName)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        // Request code per record and target. A shared code (it was 0) makes
        // FLAG_UPDATE_CURRENT rewrite one PendingIntent for every notification,
        // so each tap would open whichever record was asked about last.
        return PendingIntent.getActivity(
            context, ("$path:$recordId").hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun answer(context: Context, recordId: String, action: String, mutable: Boolean): PendingIntent {
        val intent = Intent(context, ReviewReplyReceiver::class.java)
            .setAction(action)
            .putExtra(EXTRA_RECORD_ID, recordId)
        // The request code must differ per record AND per action, or Android
        // hands every notification the same PendingIntent and the last record
        // asked about receives every answer.
        val code = (recordId + action).hashCode()
        // A RemoteInput reply needs a MUTABLE intent: the system writes the typed
        // text into it. Everything else stays immutable.
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            (if (mutable) PendingIntent.FLAG_MUTABLE else PendingIntent.FLAG_IMMUTABLE)
        return PendingIntent.getBroadcast(context, code, intent, flags)
    }

    fun ask(context: Context, recordId: String, title: String, text: String, confirmLabel: String) {
        ensureChannel(context)
        val reply = RemoteInput.Builder(KEY_NOTE)
            .setLabel("What was it? e.g. bread and milk")
            .build()
        val describe = NotificationCompat.Action.Builder(
            R.drawable.ic_stat_finxai,
            "Describe it",
            answer(context, recordId, ACTION_DESCRIBE, mutable = true),
        )
            .addRemoteInput(reply)
            .setAllowGeneratedReplies(false)
            .build()
        val confirm = NotificationCompat.Action.Builder(
            R.drawable.ic_stat_finxai,
            confirmLabel,
            answer(context, recordId, ACTION_CONFIRM, mutable = false),
        ).build()

        val n = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_finxai)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(open(context, recordId, filed = false))
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .addAction(confirm)
            .addAction(describe)
            .build()
        post(context, recordId, n)
    }

    /**
     * Replace the question with a plain line and no actions. Also what stops the
     * reply spinner: after a RemoteInput reply Android keeps showing "sending…"
     * until the notification is updated.
     */
    fun settle(
        context: Context,
        recordId: String,
        text: String,
        filed: Boolean = false,
        // Long enough to tap through to the transaction, short enough not to pile up.
        dismissAfterMs: Long = 20_000,
    ) {
        ensureChannel(context)
        val n = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_finxai)
            .setContentTitle(text)
            .setContentIntent(open(context, recordId, filed))
            .setOnlyAlertOnce(true)
            .setAutoCancel(true)
            .setSilent(true)
            .apply { if (dismissAfterMs > 0) setTimeoutAfter(dismissAfterMs) }
            .build()
        post(context, recordId, n)
    }

    fun cancel(context: Context, recordId: String) {
        NotificationManagerCompat.from(context).cancel(idFor(recordId))
    }

    private fun post(context: Context, recordId: String, n: android.app.Notification) {
        val mgr = NotificationManagerCompat.from(context)
        // Without POST_NOTIFICATIONS (Android 13+) notify() is a silent no-op;
        // checking keeps a SecurityException out of the logs on older builds.
        if (!mgr.areNotificationsEnabled()) return
        try {
            mgr.notify(idFor(recordId), n)
        } catch (e: SecurityException) {
            android.util.Log.w("FinxaiReview", "notification refused", e)
        }
    }
}
