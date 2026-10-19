package com.feyton.finxai.review

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.content.ContextCompat
import java.util.concurrent.atomic.AtomicBoolean

/**
 * A position for the moment a review question is answered.
 *
 * Unlike SmsReceiver — which only ever reads a CACHED fix, so that an incoming
 * SMS never wakes the radio — this asks for a fresh one. The difference is
 * consent: answering is a deliberate act by someone holding the phone, and the
 * user asked for exactly this ("I need to know where I was"). It is still
 * bounded: one request, a few seconds at most, then whatever is cached.
 *
 * Same permission bar as SmsReceiver: foreground location plus "Allow all the
 * time", since the answer is handled with no Activity on screen. Without it
 * this returns null and the answer is filed without a place.
 */
object AnswerLocation {
    private const val TAG = "FinxaiReview"
    private const val TIMEOUT_MS = 6_000L
    // A cached fix this fresh is as good as a new one, and costs nothing.
    private const val FRESH_ENOUGH_MS = 2 * 60 * 1000L

    fun current(context: Context, done: (Location?) -> Unit) {
        val once = AtomicBoolean(false)
        val finish = { loc: Location? -> if (once.compareAndSet(false, true)) done(loc) }
        try {
            if (!permitted(context)) {
                finish(null)
                return
            }
            val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
            if (lm == null) {
                finish(null)
                return
            }
            val cached = freshest(lm)
            if (cached != null && System.currentTimeMillis() - cached.time < FRESH_ENOUGH_MS) {
                finish(cached)
                return
            }
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
                finish(cached)
                return
            }
            val provider = listOf(
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) LocationManager.FUSED_PROVIDER else null,
                LocationManager.NETWORK_PROVIDER,
                LocationManager.GPS_PROVIDER,
            ).firstOrNull { it != null && lm.isProviderEnabled(it) }
            if (provider == null) {
                finish(cached)
                return
            }
            val cancel = CancellationSignal()
            val main = Handler(Looper.getMainLooper())
            main.postDelayed({
                cancel.cancel()
                finish(cached)
            }, TIMEOUT_MS)
            lm.getCurrentLocation(provider, cancel, ContextCompat.getMainExecutor(context)) { loc ->
                finish(loc ?: cached)
            }
        } catch (e: SecurityException) {
            Log.w(TAG, "location refused", e)
            finish(null)
        } catch (e: Throwable) {
            Log.w(TAG, "location failed", e)
            finish(null)
        }
    }

    private fun permitted(context: Context): Boolean {
        val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
        val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
        if (fine != PackageManager.PERMISSION_GRANTED && coarse != PackageManager.PERMISSION_GRANTED) {
            return false
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val bg = ContextCompat.checkSelfPermission(
                context, Manifest.permission.ACCESS_BACKGROUND_LOCATION,
            )
            if (bg != PackageManager.PERMISSION_GRANTED) {
                return false
            }
        }
        return true
    }

    @Suppress("MissingPermission")
    private fun freshest(lm: LocationManager): Location? =
        listOf(LocationManager.PASSIVE_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER)
            .mapNotNull { p -> try { lm.getLastKnownLocation(p) } catch (e: Throwable) { null } }
            .maxByOrNull { it.time }
}
