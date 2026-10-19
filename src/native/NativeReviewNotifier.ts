import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

/**
 * The review question, asked where the user already is: in the notification
 * shade, seconds after paying.
 *
 * A record the classifier is unsure about used to wait in the review queue until
 * the app was next opened — by which time "what was 3,500 at that shop?" is
 * gone from memory, and the queue grew faster than anyone cleared it. Asking
 * at the moment of payment gets a better answer for less effort: one tap to
 * accept the guess, or a few words typed into the notification itself.
 *
 * Answers come back through ReviewReplyReceiver, which runs the
 * 'FinxaiReviewTask' headless task (src/tools/reviewNotify.ts).
 */
export interface Spec extends TurboModule {
  /**
   * Post (or replace) the question for one pending record. `confirmLabel` is the
   * one-tap button ("✓ Groceries"); the reply box is always offered.
   */
  ask(recordId: string, title: string, text: string, confirmLabel: string): void;
  /**
   * Replace the question with its outcome; it dismisses itself shortly after.
   * `filed` makes a tap open the transaction rather than the review queue.
   */
  settle(recordId: string, text: string, filed: boolean): void;
  /** Withdraw a question that was answered somewhere else (e.g. in the app). */
  cancel(recordId: string): void;
}

export default TurboModuleRegistry.get<Spec>('ReviewNotifier');
