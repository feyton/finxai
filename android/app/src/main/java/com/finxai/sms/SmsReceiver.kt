package com.feyton.finxai.sms

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.provider.Telephony
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * Real-time capture of financial SMS.
 *
 * Previously the app only read the inbox on launch, so a transaction was not
 * recorded until the user next opened FinXAI. This delivers it within seconds.
 *
 * Two things here are deliberately conservative about battery:
 *
 *  1. A cheap text prefilter. This receiver fires for EVERY incoming SMS,
 *     including personal messages. Spinning up a React Native headless task per
 *     text would be both wasteful and a privacy problem, so a message must look
 *     financial before JS is woken at all. The filter is intentionally loose —
 *     a false positive costs one no-op task, a false negative loses a
 *     transaction until the next poll, so it errs toward waking.
 *
 *  2. Location is read from the LAST KNOWN cached fix only, never requested.
 *     `requestSingleUpdate`/`getCurrentLocation` would wake the GPS or network
 *     radio on every qualifying SMS, which is exactly the battery drain we were
 *     asked to avoid. `getLastKnownLocation` returns whatever Android already
 *     had from other apps' activity and costs essentially nothing. If nothing
 *     recent is cached, the transaction simply carries no location.
 */
class SmsReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "FinxaiSmsReceiver"

        // A cached fix older than this is not worth attaching — the user could
        // be kilometres away by now, and a wrong location is worse than none.
        private const val MAX_LOCATION_AGE_MS = 10 * 60 * 1000L // 10 minutes

        // Anything wider than this is a coarse cell-tower estimate that says
        // little about where money was actually spent.
        private const val MAX_ACCURACY_M = 3000f

        /**
         * Does this look like a financial alert at all? Cheap, allocation-light,
         * and applied before any JS is started.
         */
        fun looksFinancial(body: String): Boolean {
            val s = body.lowercase()
            val hasCurrency = s.contains("rwf") || s.contains("frw")
            if (!hasCurrency) return false
            return s.contains("balance") ||
                s.contains("transaction") ||
                s.contains("payment") ||
                s.contains("received") ||
                s.contains("debited") ||
                s.contains("credited") ||
                s.contains("deposit") ||
                s.contains("withdraw") ||
                s.contains("sent to") ||
                s.contains("kubitsa") ||   // Kinyarwanda: to deposit
                s.contains("ufite")        // Kinyarwanda: you have (balance)
        }

        /**
         * Does it look like money LEAVING the account? Location is attached to
         * money-out only — those are the transactions a person physically acts
         * on somewhere — so this decides whether to bother reading a location.
         *
         * Only a hint: JS re-decides from the real parse and drops the location
         * if the transaction turns out to be income or an inter-account
         * transfer. Being loose here is free because the read is cached.
         */
        fun looksMoneyOut(body: String): Boolean {
            val s = body.lowercase()
            if (s.contains("you have received") || s.contains("credited")) return false
            return s.contains("payment of") ||
                s.contains("transaction of") ||
                s.contains("debited") ||
                s.contains("sent to") ||
                s.contains("withdraw") ||
                s.contains("paid")
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        try {
            // Multipart messages arrive as several PDUs belonging to one logical
            // SMS; concatenate them or a long alert is truncated mid-number.
            val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
            if (messages.isEmpty()) return

            val body = StringBuilder()
            for (m in messages) {
                body.append(m.displayMessageBody ?: m.messageBody ?: "")
            }
            val text = body.toString()
            val sender = messages[0].originatingAddress ?: ""
            val timestamp = messages[0].timestampMillis

            if (text.isBlank() || !looksFinancial(text)) return

            val payload = android.os.Bundle().apply {
                putString("body", text)
                putString("sender", sender)
                putDouble("date", timestamp.toDouble())
            }

            if (looksMoneyOut(text)) {
                cachedLocation(context)?.let { loc ->
                    payload.putDouble("lat", loc.latitude)
                    payload.putDouble("lon", loc.longitude)
                    payload.putDouble("accuracy", loc.accuracy.toDouble())
                    payload.putDouble("locationAt", loc.time.toDouble())
                }
            }

            val service = Intent(context, SmsHeadlessTaskService::class.java)
            service.putExtras(payload)
            context.startService(service)
            // Keeps the device awake just long enough for the JS task to start;
            // HeadlessJsTaskService releases it when the task completes.
            com.facebook.react.HeadlessJsTaskService.acquireWakeLockNow(context)
        } catch (e: Throwable) {
            // A crash in a broadcast receiver surfaces to the user as an app
            // crash toast for an SMS they may not even care about. The poller
            // remains the backstop for anything missed here.
            Log.w(TAG, "failed to handle incoming SMS", e)
        }
    }

    /**
     * Freshest usable cached fix, or null. Never triggers a location request.
     */
    private fun cachedLocation(context: Context): Location? {
        val fine = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_FINE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_COARSE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
        if (!fine && !coarse) return null

        // From Android 10 the app also needs background-location access to read
        // a position while not in the foreground, which is exactly the case
        // here. Without it the read returns nothing rather than throwing.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val bg = ContextCompat.checkSelfPermission(
                context, Manifest.permission.ACCESS_BACKGROUND_LOCATION,
            ) == PackageManager.PERMISSION_GRANTED
            if (!bg) return null
        }

        val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
            ?: return null

        // PASSIVE first: it is purely other apps' fixes, so it is the cheapest
        // and most likely to be warm. NETWORK next. GPS last — its cached fix
        // is often stale indoors, and we never ask it for a new one.
        val providers = listOf(
            LocationManager.PASSIVE_PROVIDER,
            LocationManager.NETWORK_PROVIDER,
            LocationManager.GPS_PROVIDER,
        )
        val now = System.currentTimeMillis()
        var best: Location? = null
        for (p in providers) {
            val loc = try {
                if (!lm.isProviderEnabled(p)) continue
                lm.getLastKnownLocation(p)
            } catch (e: SecurityException) {
                null
            } ?: continue

            if (now - loc.time > MAX_LOCATION_AGE_MS) continue
            if (loc.accuracy > MAX_ACCURACY_M) continue
            if (best == null || loc.time > best.time) best = loc
        }
        return best
    }
}
