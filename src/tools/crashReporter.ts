// Minimal JS crash capture: persists the last fatal error so the next launch
// can show exactly what died (message + stack + app version) instead of a
// bare Samsung "FinXAI keeps stopping" toast. Native (Java) crashes are not
// visible from here — those need `adb logcat -b crash`.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {APP_VERSION} from '../appVersion';

const KEY = 'finxai.lastCrash';

export interface CrashRecord {
  message: string;
  stack: string;
  fatal: boolean;
  version: string;
  at: string;
}

export function installCrashReporter(): void {
  const errorUtils = (global as any).ErrorUtils;
  if (!errorUtils?.setGlobalHandler) {
    return;
  }
  const prev = errorUtils.getGlobalHandler?.();
  errorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    try {
      const record: CrashRecord = {
        message: String(error?.message ?? error ?? 'Unknown error'),
        stack: String(error?.stack ?? '').slice(0, 6000),
        fatal: !!isFatal,
        version: APP_VERSION,
        at: new Date().toISOString(),
      };
      // best-effort — a fatal teardown may race this write
      AsyncStorage.setItem(KEY, JSON.stringify(record)).catch(() => {});
    } catch {}
    prev?.(error, isFatal);
  });
}

// Returns the last crash (clearing it) — call once on startup.
export async function takeLastCrash(): Promise<CrashRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) {
      return null;
    }
    await AsyncStorage.removeItem(KEY);
    return JSON.parse(raw) as CrashRecord;
  } catch {
    return null;
  }
}
