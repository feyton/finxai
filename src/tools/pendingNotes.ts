// Notes the user typed for a record that could not be filed yet.
//
// A description typed into a review notification while the AI was unreachable
// cannot ride on the pending row (auto_records has no `note` column in
// Postgres), so it waits here, on the device, keyed by record id. It used to be
// read back ONLY by the Fix sheet — so confirming the same record with plain
// Confirm filed it and silently dropped what the user had typed ("fruits 2000
// and vegetables 1000" — gone). promoteAutoRecord now takes it on every path.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'finxai.reviewNotes';

async function readAll(): Promise<Record<string, string>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}');
  } catch {
    return {};
  }
}

export async function keepPendingNote(recordId: string, note: string): Promise<void> {
  const map = await readAll();
  map[recordId] = note;
  await AsyncStorage.setItem(KEY, JSON.stringify(map));
}

/** Peek, for pre-filling the Fix sheet. */
export async function pendingNoteFor(recordId: string): Promise<string | null> {
  return (await readAll())[recordId] ?? null;
}

/** Read and forget — call when the record is actually filed. */
export async function takePendingNote(recordId: string): Promise<string | null> {
  const map = await readAll();
  const note = map[recordId] ?? null;
  if (note !== null) {
    delete map[recordId];
    await AsyncStorage.setItem(KEY, JSON.stringify(map));
  }
  return note;
}
