import {createClient} from '@/lib/supabase/server';
import {loadDatasets} from '@/lib/insights';
import {Topbar} from '@/components/ui';
import type {Tag, Transaction} from '@/lib/types';
import {TagsClient} from './TagsClient';

export const dynamic = 'force-dynamic';

export default async function TagsPage({searchParams}: {searchParams: Promise<{tag?: string}>}) {
  const params = await searchParams;
  const d = await loadDatasets(1);
  const supabase = await createClient();
  const [tagsRes, txRes, userRes] = await Promise.all([
    supabase.from('tags').select('*').order('created_at', {ascending: false}),
    // Every tagged row regardless of date. loadDatasets only covers recent months,
    // and a tag's balance is meaningless if its first purchases are cut off.
    supabase
      .from('transactions')
      .select('*')
      .not('tag_ids', 'is', null)
      .order('date_time', {ascending: false})
      .limit(5000),
    supabase.auth.getUser(),
  ]);

  return (
    <>
      <Topbar
        title="Tags"
        sub="Group transactions by what they were for — errands, trips, events — and see where each one stands"
        syncLabel={d.syncLabel}
        reviewCount={d.reviewCount}
      />
      <TagsClient
        initialTags={(tagsRes.data ?? []) as Tag[]}
        tagged={(txRes.data ?? []) as Transaction[]}
        accounts={d.accounts}
        ownerId={userRes.data.user?.id ?? ''}
        presetTag={params.tag ?? null}
        // A missing table is the one failure worth naming: it means migration v21
        // has not been run, and every action on this page would fail.
        setupError={tagsRes.error ? tagsRes.error.message : null}
      />
    </>
  );
}
