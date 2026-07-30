package com.feyton.finxai.sms

import android.content.Intent
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
    // Nullable Intent: that is the base class's signature in this RN version
    // (HeadlessJsTaskService.kt), and a non-null parameter overrides nothing.
    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        val extras = intent?.extras ?: return null
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
