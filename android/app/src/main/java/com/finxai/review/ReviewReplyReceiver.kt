package com.feyton.finxai.review

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.RemoteInput
import androidx.core.content.ContextCompat
import com.facebook.react.HeadlessJsTaskService
import com.feyton.finxai.sms.SmsHeadlessTaskService

/**
 * The user answered a review question from the notification: tapped the
 * one-tap guess, or typed a description. Hands the answer to the
 * 'FinxaiReviewTask' headless task, which files the record the same way the
 * review screen would.
 *
 * Not exported: only our own PendingIntents can reach it. An exported receiver
 * would let any app on the phone confirm or rewrite pending transactions.
 */
class ReviewReplyReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        try {
            val recordId = intent.getStringExtra(ReviewNotifications.EXTRA_RECORD_ID) ?: return
            val kind = when (intent.action) {
                ReviewNotifications.ACTION_CONFIRM -> "confirm"
                ReviewNotifications.ACTION_DESCRIBE -> "describe"
                else -> return
            }
            val note = RemoteInput.getResultsFromIntent(intent)
                ?.getCharSequence(ReviewNotifications.KEY_NOTE)
                ?.toString()
                ?.trim()
                .orEmpty()
            if (kind == "describe" && note.isEmpty()) {
                // An empty send: leave the question up so it can be answered.
                return
            }

            // Answer immediately, before any JS runs: after a reply Android shows
            // a spinner until the notification changes, and the JS side may take
            // a model round-trip. JS replaces this with the real outcome.
            // Expires on its own: if the task dies before JS settles it (seen once on a
            // second answer in the same process), a permanent "Filing…" would sit in the
            // shade claiming work that is not happening. The record stays pending.
            ReviewNotifications.settle(context, recordId, "Filing…", dismissAfterMs = 60_000)

            // Answering is the one moment we KNOW the user is holding the phone,
            // usually still where they paid — the best chance at "where was I"
            // for a payment whose SMS arrived with no cached fix. goAsync keeps
            // the receiver alive for the short, bounded wait.
            val pending = goAsync()
            AnswerLocation.current(context) { loc ->
                try {
                    val service = Intent(context, SmsHeadlessTaskService::class.java)
                        .putExtra(SmsHeadlessTaskService.EXTRA_TASK, "FinxaiReviewTask")
                        .putExtra("recordId", recordId)
                        .putExtra("kind", kind)
                        .putExtra("note", note)
                    if (loc != null) {
                        service.putExtra("lat", loc.latitude)
                            .putExtra("lon", loc.longitude)
                            .putExtra("accuracy", loc.accuracy.toDouble())
                            .putExtra("locationAt", loc.time.toDouble())
                    }
                    HeadlessJsTaskService.acquireWakeLockNow(context)
                    // Same two-step start as SmsReceiver: a notification action
                    // usually carries a background-start allowance, but "usually"
                    // would drop an answer the user typed.
                    try {
                        context.startService(service)
                    } catch (e: IllegalStateException) {
                        Log.w(TAG, "startService refused, using foreground service", e)
                        ContextCompat.startForegroundService(context, service)
                    }
                } catch (e: Throwable) {
                    Log.w(TAG, "could not start review task", e)
                } finally {
                    pending.finish()
                }
            }
        } catch (e: Throwable) {
            Log.w(TAG, "could not handle review answer", e)
        }
    }

    companion object {
        private const val TAG = "FinxaiReview"
    }
}
