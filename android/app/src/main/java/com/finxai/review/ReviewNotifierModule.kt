package com.feyton.finxai.review

import com.facebook.react.bridge.ReactApplicationContext
// Codegen emits every spec into one package (see codegenConfig in package.json).
import com.feyton.finxai.specs.NativeReviewNotifierSpec

/** JS entry point for review questions — see src/native/NativeReviewNotifier.ts. */
class ReviewNotifierModule(reactContext: ReactApplicationContext) :
    NativeReviewNotifierSpec(reactContext) {

    override fun getName(): String = NAME

    override fun ask(recordId: String, title: String, text: String, confirmLabel: String) {
        ReviewNotifications.ask(reactApplicationContext, recordId, title, text, confirmLabel)
    }

    override fun settle(recordId: String, text: String, filed: Boolean) {
        ReviewNotifications.settle(reactApplicationContext, recordId, text, filed)
    }

    override fun cancel(recordId: String) {
        ReviewNotifications.cancel(reactApplicationContext, recordId)
    }

    companion object {
        const val NAME = "ReviewNotifier"
    }
}
