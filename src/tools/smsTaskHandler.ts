// Headless JS task for a live-captured SMS.
//
// Runs with NO React tree: no hooks, no component state, no navigation. It talks
// to the PowerSync singleton directly and resolves the session itself, because
// none of the app's context providers are mounted when this fires.
//
// Registered as 'FinxaiSmsTask' in index.js; started by
// android/.../sms/SmsHeadlessTaskService.kt on an SMS_RECEIVED broadcast.

import {db} from './database';
import {supabase} from './supabase';
import {ingestLiveSms, SmsLocation} from './smsIngest';
import {refreshBalanceWidget} from '../widgets/refreshWidget';

export interface SmsTaskPayload {
  body?: string;
  sender?: string;
  date?: number;
  lat?: number;
  lon?: number;
  accuracy?: number;
  locationAt?: number;
}

export async function smsTaskHandler(payload: SmsTaskPayload): Promise<void> {
  try {
    const body = payload?.body ?? '';
    if (!body) {
      return;
    }

    // The local database is readable without an active sync connection, but the
    // AI classifier is not — an expired session means classification degrades to
    // regex rather than failing, and the record still gets written.
    const {
      data: {session},
    } = await supabase.auth.getSession();
    const ownerId = session?.user?.id ?? '';
    if (!ownerId) {
      // Nothing sensible to attribute the transaction to. The in-app poller
      // will pick this message up once the user signs in again.
      console.warn('[SmsTask] no session — leaving message for the poller');
      return;
    }
    const meta = session?.user?.user_metadata ?? {};
    const userName: string = meta.full_name ?? meta.name ?? '';

    const location: SmsLocation | null =
      typeof payload.lat === 'number' && typeof payload.lon === 'number'
        ? {
            lat: payload.lat,
            lon: payload.lon,
            accuracyM: typeof payload.accuracy === 'number' ? payload.accuracy : null,
            at: payload.locationAt
              ? new Date(payload.locationAt).toISOString()
              : null,
          }
        : null;

    const outcome = await ingestLiveSms(
      db,
      ownerId,
      userName,
      {
        body,
        sender: payload.sender ?? '',
        date: payload.date ?? Date.now(),
        location,
      },
      session?.access_token ?? '',
    );

    console.log(`[SmsTask] ${outcome}${location ? ' (with location)' : ''}`);

    // Keep the home-screen widget honest — a live-captured expense should be
    // visible there without waiting for the app to be opened.
    if (outcome === 'saved') {
      refreshBalanceWidget();
    }
  } catch (e) {
    // Never rethrow: an unhandled rejection here surfaces as a crash for an SMS
    // the user may not care about, and the poller remains the backstop.
    console.warn('[SmsTask] failed:', e);
  }
}
