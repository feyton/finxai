'use client';

import {useCallback, useMemo, useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {accountTint, fmtMoney} from '@/lib/theme';
import type {Account, AccountShare} from '@/lib/types';

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
      // The DB trigger resolves the email to a user id and activates the
      // share; select back the row to reflect that.
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
      // Best-effort invitation email via our own API (Mailjet). The share
      // itself is already live — an email failure is a warning, not an error.
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
            setErr(
              'Share created, but the invitation email failed to send — check the Mailjet configuration on the server.',
            );
          }
        })
        .catch(() => {
          setErr('Share created, but the invitation email failed to send.');
        });
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

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Shared access</div>
          <div className="page-sub">
            Share an account with someone — they see it and its transactions;
            SMS parsing stays on the owner&apos;s phone.
          </div>
        </div>
      </div>

      {err && <div className="banner-err">{err}</div>}

      <div className="grid grid-2 mb-3">
        {/* New share */}
        <div className="card">
          <div className="section-title">Share one of your accounts</div>
          <label className="field">
            <span>Account</span>
            <select
              className="select"
              value={accountId}
              onChange={e => setAccountId(e.target.value)}>
              <option value="">Choose an account…</option>
              {owned.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name} — {fmtMoney(a.available_balance ?? 0)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
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
          <label className="field">
            <span>Access</span>
            <select
              className="select"
              value={access}
              onChange={e => setAccess(e.target.value as 'view' | 'edit')}>
              <option value="view">View only</option>
              <option value="edit">Can view &amp; edit (reclassify, notes)</option>
            </select>
          </label>
          <button className="btn btn-primary" disabled={busy} onClick={share}>
            {busy ? 'Sharing…' : 'Share account'}
          </button>
          <p className="mt-3 text-[11px] leading-relaxed text-ink3">
            If they already use FinXAI, the account appears on their devices
            immediately. Otherwise it activates the first time they sign in
            with this email. An invitation email is sent either way.
          </p>
        </div>

        {/* Shares I gave */}
        <div className="card">
          <div className="section-title">You shared</div>
          {given.length === 0 ? (
            <div className="empty">Nothing shared yet.</div>
          ) : (
            <div className="flex flex-col">
              {given.map(s => {
                const tint = accountTint(accName.get(s.account_id) ?? '');
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0">
                    <div
                      className="avatar !h-8 !w-8 text-[11px] font-bold"
                      style={{background: tint + '22', color: tint}}>
                      {(accName.get(s.account_id) ?? '?')[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium text-ink">
                        {accName.get(s.account_id) ?? 'Account'}
                        <span className="text-ink3"> → {s.invitee_email}</span>
                      </div>
                      <div className="text-[10.5px] text-ink3">
                        {s.access === 'edit' ? 'Can view & edit' : 'View only'}
                        {' · '}
                        {s.status === 'active' ? (
                          <span className="text-pos">active</span>
                        ) : (
                          <span className="text-warn">waiting for first sign-in</span>
                        )}
                      </div>
                    </div>
                    <button
                      className="btn btn-danger !px-2 !py-1 text-[11px]"
                      disabled={busy}
                      onClick={() => revoke(s.id)}>
                      Revoke
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Shared with me */}
      <div className="card">
        <div className="section-title">Shared with you</div>
        {received.length === 0 ? (
          <div className="empty">
            No accounts shared with you yet — when someone shares one, it
            appears here and in your apps automatically.
          </div>
        ) : (
          <div className="flex flex-col">
            {received.map(s => (
              <div
                key={s.id}
                className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0">
                <span className="pill bg-accent-soft text-accent2">shared</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-medium text-ink">
                    {accName.get(s.account_id) ?? 'Account'}
                  </div>
                  <div className="text-[10.5px] text-ink3">
                    {s.access === 'edit' ? 'You can view & edit' : 'View only'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
