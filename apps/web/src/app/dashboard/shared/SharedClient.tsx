'use client';

import {useCallback, useMemo, useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {accountTint, fmtAmount} from '@/lib/theme';
import type {Account, AccountShare} from '@/lib/types';
import {Icon} from '@/components/Icon';
import {Card, Pill, WEmpty, WSection} from '@/components/ui';

export function SharedClient({
  uid,
  userName,
  initialAccounts,
  initialShares,
}: {
  uid: string;
  userName: string;
  initialAccounts: Account[];
  initialShares: AccountShare[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [shares, setShares] = useState<AccountShare[]>(initialShares);
  const [accountId, setAccountId] = useState('');
  const [email, setEmail] = useState('');
  const [access, setAccess] = useState<'view' | 'edit'>('view');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const owned = initialAccounts.filter(a => a.owner_id === uid);
  const accName = useMemo(
    () => new Map(initialAccounts.map(a => [a.id, a.name ?? 'Account'])),
    [initialAccounts],
  );

  const given = shares.filter(s => s.owner_id === uid);
  const received = shares.filter(s => s.shared_with_id === uid && s.owner_id !== uid);

  const share = useCallback(async () => {
    const target = email.trim().toLowerCase();
    if (!accountId) return setErr('Pick an account to share');
    if (!target.includes('@')) return setErr('Enter a valid email');
    if (given.some(s => s.account_id === accountId && s.invitee_email === target)) {
      return setErr('Already shared with that email');
    }
    setBusy(true);
    setErr(null);
    try {
      const {data, error} = await supabase
        .from('account_shares')
        .insert({
          account_id: accountId,
          owner_id: uid,
          invitee_email: target,
          access,
          status: 'pending',
        })
        .select()
        .single();
      if (error) throw error;
      setShares(prev => [data as AccountShare, ...prev]);
      fetch('/api/invite', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          email: target,
          inviterName: userName,
          inviteeName: target.split('@')[0],
        }),
      })
        .then(r => {
          if (!r.ok) {
            setErr('Share created, but the invitation email failed to send — check the Mailjet configuration.');
          }
        })
        .catch(() => setErr('Share created, but the invitation email failed to send.'));
      setEmail('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Share failed');
    } finally {
      setBusy(false);
    }
  }, [supabase, uid, userName, accountId, email, access, given]);

  const revoke = useCallback(
    async (id: string) => {
      setBusy(true);
      setErr(null);
      try {
        const {error} = await supabase.from('account_shares').delete().eq('id', id);
        if (error) throw error;
        setShares(prev => prev.filter(s => s.id !== id));
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Revoke failed');
      } finally {
        setBusy(false);
      }
    },
    [supabase],
  );

  const ShareTable = ({rows, mine}: {rows: AccountShare[]; mine: boolean}) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr style={{borderBottom: '1px solid var(--border)'}}>
            <th className="th pl-5">Account</th>
            <th className="th">{mine ? 'Shared with' : 'Access'}</th>
            {mine && <th className="th">Access</th>}
            <th className="th">Status</th>
            {mine && <th className="th w-[90px]" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((s, i, arr) => {
            const name = accName.get(s.account_id) ?? 'Account';
            const tint = accountTint(name);
            return (
              <tr key={s.id} style={{borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none'}}>
                <td className="td py-3 pl-5">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="avatar !h-8 !w-8 text-[12px]"
                      style={{background: tint + '22', color: tint}}>
                      {name[0]}
                    </span>
                    <span className="text-[13px] font-medium">{name}</span>
                  </div>
                </td>
                <td className="td text-[12.5px] text-ink2">
                  {mine ? (
                    s.invitee_email
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <Icon name={s.access === 'edit' ? 'pencil' : 'eye'} size={12} />
                      {s.access === 'edit' ? 'You can view & edit' : 'View only'}
                    </span>
                  )}
                </td>
                {mine && (
                  <td className="td">
                    <span className="flex items-center gap-1.5 text-[12px] text-ink2">
                      <Icon name={s.access === 'edit' ? 'pencil' : 'eye'} size={12} />
                      {s.access === 'edit' ? 'Can view & edit' : 'View only'}
                    </span>
                  </td>
                )}
                <td className="td">
                  <Pill
                    color={s.status === 'active' ? 'var(--income)' : 'var(--warn)'}
                    bg={(s.status === 'active' ? 'var(--income)' : 'var(--warn)') + '18'}>
                    {s.status === 'active' ? 'Active' : 'Waiting for first sign-in'}
                  </Pill>
                </td>
                {mine && (
                  <td className="td pr-4 text-right">
                    <button className="btn btn-danger !px-2.5 !py-1 text-[11px]" disabled={busy} onClick={() => revoke(s.id)}>
                      Revoke
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      {err && <div className="banner-err">{err}</div>}

      {/* Privacy banner */}
      <div
        className="flex gap-3 rounded-xl px-4 py-3"
        style={{background: 'var(--accent-soft)', border: '1px solid rgba(22,163,74,0.2)'}}>
        <Icon name="lock" size={18} color="var(--accent-700)" style={{marginTop: 2}} />
        <div className="text-[12.5px] leading-relaxed text-ink2">
          Access is <b className="text-ink">per-account</b>, never full-profile. People you invite see only the accounts
          you grant — view-only, or view &amp; edit (reclassify and annotate). SMS parsing always stays on the
          owner&apos;s phone.
        </div>
      </div>

      <div className="grid gap-[18px] lg:grid-cols-3">
        {/* New share form */}
        <Card>
          <WSection title="Share an account" sub="They get it on their devices automatically">
            <div className="mt-1 flex flex-col gap-3.5">
              <label className="field !mb-0">
                <span>Account</span>
                <select className="select" value={accountId} onChange={e => setAccountId(e.target.value)}>
                  <option value="">Choose an account…</option>
                  {owned.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} — {fmtAmount(a.available_balance ?? 0)} RWF
                    </option>
                  ))}
                </select>
              </label>
              <label className="field !mb-0">
                <span>Their email</span>
                <input
                  className="input"
                  type="email"
                  placeholder="wife@example.com"
                  value={email}
                  onChange={e => {
                    setEmail(e.target.value);
                    setErr(null);
                  }}
                />
              </label>
              <label className="field !mb-0">
                <span>Permission</span>
                <select className="select" value={access} onChange={e => setAccess(e.target.value as 'view' | 'edit')}>
                  <option value="view">View only</option>
                  <option value="edit">Can view &amp; edit</option>
                </select>
              </label>
              <button className="btn btn-primary justify-center" disabled={busy} onClick={share}>
                <Icon name="userPlus" size={14} />
                {busy ? 'Sharing…' : 'Share account'}
              </button>
              <p className="text-[11px] leading-relaxed text-ink3">
                Already on FinXAI? It appears immediately. Otherwise it activates on their first sign-in with this
                email — an invitation email goes out either way.
              </p>
            </div>
          </WSection>
        </Card>

        {/* Shares I gave */}
        <Card pad={0} style={{gridColumn: 'span 2'}}>
          <div className="px-5 pb-1 pt-4">
            <WSection title="You shared" sub={`${given.length} share${given.length === 1 ? '' : 's'}`}>
              <span />
            </WSection>
          </div>
          {given.length === 0 ? (
            <WEmpty icon="users" title="Nothing shared yet" sub="Share an account and it shows up here." />
          ) : (
            <ShareTable rows={given} mine />
          )}
        </Card>
      </div>

      {/* Shared with me */}
      <Card pad={0}>
        <div className="px-5 pb-1 pt-4">
          <WSection title="Shared with you" sub="Accounts other people gave you access to">
            <span />
          </WSection>
        </div>
        {received.length === 0 ? (
          <WEmpty
            icon="users"
            title="No accounts shared with you yet"
            sub="When someone shares one, it appears here and in your apps automatically."
          />
        ) : (
          <ShareTable rows={received} mine={false} />
        )}
      </Card>
    </div>
  );
}
