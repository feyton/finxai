import {usePowerSync, useQuery} from '@powersync/react-native';
import {useCallback} from 'react';
import {useCurrentUser} from './useCurrentUser';

export type AiProvider = 'anthropic' | 'gemini';

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * The user's chosen AI provider, used for BOTH SMS classification and the
 * Finance Coach.
 *
 * Stored in the synced `user_settings` table rather than on-device, so the
 * choice follows the user across installs and the server can read it per
 * request (see apps/web/src/lib/aiProvider.ts). `null` means "not chosen" —
 * the server falls back to AI_PROVIDER_DEFAULT.
 */
export function useAiProvider() {
  const db = usePowerSync();
  const {userId} = useCurrentUser();

  const {data: rows, isLoading} = useQuery<{id: string; ai_provider: string | null}>(
    'SELECT id, ai_provider FROM user_settings WHERE owner_id = ? LIMIT 1',
    [userId ?? ''],
  );
  const row = rows?.[0];
  const provider = (row?.ai_provider as AiProvider | null) ?? null;

  const setProvider = useCallback(
    async (next: AiProvider) => {
      if (!userId) {
        return;
      }
      const now = new Date().toISOString();
      if (row?.id) {
        await db.execute(
          'UPDATE user_settings SET ai_provider = ?, updated_at = ? WHERE id = ?',
          [next, now, row.id],
        );
      } else {
        await db.execute(
          'INSERT INTO user_settings (id, ai_provider, owner_id, updated_at) VALUES (?, ?, ?, ?)',
          [uuid(), next, userId, now],
        );
      }
    },
    [db, row?.id, userId],
  );

  return {provider, setProvider, isLoading};
}
