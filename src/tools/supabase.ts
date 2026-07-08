import AsyncStorage from '@react-native-async-storage/async-storage';
import {createClient} from '@supabase/supabase-js';

// Your Supabase project URL (derived from connection string project ref)
export const SUPABASE_URL = 'https://gfsfjdcxxojmctnjfuvh.supabase.co';

export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdmc2ZqZGN4eG9qbWN0bmpmdXZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxMjkyNzAsImV4cCI6MjA5NTcwNTI3MH0.nh-6AQGsa74nzXbJAqztX_ABtjEeBlRAXC-6v2yHxHk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // React Native has no localStorage — without explicit storage the
    // session is dropped on every app restart.
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export async function getCurrentUserId(): Promise<string | null> {
  const {
    data: {session},
  } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}
