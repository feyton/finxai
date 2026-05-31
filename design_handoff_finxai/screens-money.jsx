// screens-money.jsx — Records, Accounts, Account detail, Txn detail, Add account
const { useState: useStateM } = React;

// ── Records (transaction list) ───────────────────────────────
const RecordsScreen = ({ go }) => {
  const [filter, setFilter] = useStateM('all');
  const filters = [
    { id: 'all', label: 'All' }, { id: 'expense', label: 'Spending' },
    { id: 'income', label: 'Income' }, { id: 'sms', label: 'AI-tagged' },
  ];
  let list = TXNS;
  if (filter === 'expense') list = TXNS.filter(t => t.amount < 0);
  if (filter === 'income') list = TXNS.filter(t => t.amount > 0);
  if (filter === 'sms') list = TXNS.filter(t => t.source === 'sms');

  // group by date label
  const groups = {};
  list.forEach(t => { (groups[t.date] = groups[t.date] || []).push(t); });

  const spent = TXNS.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const inc = TXNS.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);

  return (
    <div className="screen-in" style={{ paddingBottom: 24 }}>
      <div style={{ padding: '14px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Records</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <IconBtn icon="search" />
          <IconBtn icon="filter" />
        </div>
      </div>

      {/* month summary */}
      <div style={{ padding: '0 16px' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <SummaryTile label="Money in" value={inc} color="var(--income)" icon="downLeft" />
          <SummaryTile label="Money out" value={spent} color="var(--expense)" icon="upRight" />
        </div>
      </div>

      {/* filters */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '12px 16px', scrollbarWidth: 'none' }}>
        {filters.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} className="press" style={{
            flexShrink: 0, padding: '7px 14px', borderRadius: 99, fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
            background: filter === f.id ? 'var(--accent)' : 'var(--surface-2)',
            color: filter === f.id ? 'var(--accent-ink)' : 'var(--text-2)',
            border: '1px solid ' + (filter === f.id ? 'transparent' : 'var(--border)'),
          }}>{f.label}</button>
        ))}
      </div>

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {Object.entries(groups).map(([date, items]) => {
          const dayTotal = items.reduce((s, t) => s + t.amount, 0);
          return (
            <div key={date}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 4px 6px' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>{date}</span>
                <span className="tabnum" style={{ fontSize: 11.5, color: dayTotal >= 0 ? 'var(--income)' : 'var(--text-3)' }}>{signed(dayTotal)} RWF</span>
              </div>
              <Card pad={6}>
                {items.map((t, i) => <TxnRow key={t.id} t={t} go={go} divider={i < items.length - 1} />)}
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const IconBtn = ({ icon, onClick, color = 'var(--text-2)' }) => (
  <button onClick={onClick} className="press" style={{
    width: 38, height: 38, borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', color,
  }}><Icon name={icon} size={19} /></button>
);

const SummaryTile = ({ label, value, color, icon }) => (
  <div style={{ flex: 1, padding: 13, borderRadius: 'var(--r)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
      <div style={{ width: 26, height: 26, borderRadius: 8, background: color + '22', color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={15} sw={2.4} />
      </div>
      <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{label}</span>
    </div>
    <div className="tabnum" style={{ fontSize: 17, fontWeight: 700, color }}>{fmt(value)}<span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 3 }}>RWF</span></div>
  </div>
);

// ── Accounts list ────────────────────────────────────────────
const AccountsScreen = ({ go }) => (
  <div className="screen-in" style={{ paddingBottom: 24 }}>
    <div style={{ padding: '14px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Accounts</h2>
      <Btn variant="soft" size="sm" icon="plus" onClick={() => go('add-account')}>Add</Btn>
    </div>

    <div style={{ padding: '0 16px' }}>
      <div style={{
        borderRadius: 'var(--r-lg)', padding: 18, marginBottom: 16,
        background: 'radial-gradient(140% 120% at 100% 0%, rgba(34,197,94,0.18), rgba(26,31,36,0.4) 55%), var(--surface)',
        border: '1px solid var(--border)',
      }}>
        <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Net worth · {ACCOUNTS.length} accounts</div>
        <div className="tabnum" style={{ fontSize: 30, fontWeight: 700, marginTop: 4 }}>{fmt(totalBalance)}<span style={{ fontSize: 15, color: 'var(--text-3)', marginLeft: 6 }}>RWF</span></div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ACCOUNTS.map(a => (
          <Card key={a.id} onClick={() => go('account', { id: a.id })} pad={14} style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <div style={{ width: 44, height: 44, borderRadius: 13, background: a.tint + '22', color: a.tint, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name={a.icon} size={23} sw={2} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
                {a.name}
                {a.shared && <Pill icon="users" size={9} color="var(--info)" bg="rgba(96,165,250,0.16)">Shared</Pill>}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{a.kind} · {a.last}</div>
            </div>
            <div className="tabnum" style={{ fontSize: 15, fontWeight: 700 }}>{fmt(a.balance)}</div>
          </Card>
        ))}
      </div>
    </div>
  </div>
);

// ── Account detail ───────────────────────────────────────────
const AccountDetail = ({ go, params }) => {
  const a = ACCOUNTS.find(x => x.id === params.id) || ACCOUNTS[0];
  const txns = TXNS.filter(t => t.acct === a.id);
  return (
    <div className="screen-in">
      <ScreenHeader title={a.name} sub={a.kind + ' · ' + a.last} onBack={() => go('accounts')}
        right={<IconBtn icon="dots" />} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ borderRadius: 'var(--r-lg)', padding: 18, background: `radial-gradient(140% 120% at 0% 0%, ${a.tint}28, var(--surface) 60%)`, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: a.tint + '2a', color: a.tint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={a.icon} size={22} /></div>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Available balance</div>
          </div>
          <div className="tabnum" style={{ fontSize: 32, fontWeight: 700, marginTop: 10 }}>{fmt(a.balance)}<span style={{ fontSize: 15, color: 'var(--text-3)', marginLeft: 6 }}>RWF</span></div>
          <div style={{ display: 'flex', gap: 9, marginTop: 16 }}>
            <Btn variant="primary" size="sm" icon="plus" full onClick={() => go('add-txn')}>Add</Btn>
            <Btn variant="ghost" size="sm" icon="share" full onClick={() => go('share-account', { id: a.id })}>Share</Btn>
            <Btn variant="ghost" size="sm" icon="refresh" full>Sync</Btn>
          </div>
        </div>
        <div>
          <SectionHeader title="Activity" />
          <Card pad={6}>
            {txns.map((t, i) => <TxnRow key={t.id} t={t} go={go} divider={i < txns.length - 1} />)}
            {txns.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>No transactions yet</div>}
          </Card>
        </div>
      </div>
    </div>
  );
};

// ── Transaction detail (with AI reasoning) ───────────────────
const TxnDetail = ({ go, params }) => {
  const t = TXNS.find(x => x.id === params.id) || TXNS[0];
  const c = CATS[t.cat];
  const a = ACCOUNTS.find(x => x.id === t.acct);
  return (
    <div className="screen-in">
      <ScreenHeader title="Transaction" onBack={() => go('records')} right={<IconBtn icon="pencil" />} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
          <div style={{ margin: '0 auto 12px', width: 64, height: 64, borderRadius: 20, background: c.color + '22', color: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={c.icon} size={32} sw={1.9} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{t.merchant}</div>
          <div className="tabnum" style={{ fontSize: 30, fontWeight: 700, color: t.amount < 0 ? 'var(--expense)' : 'var(--income)', marginTop: 4 }}>{signed(t.amount)}<span style={{ fontSize: 14, color: 'var(--text-3)', marginLeft: 5 }}>RWF</span></div>
        </div>

        <Card pad={4}>
          <DetailRow label="Category" value={c.label} chip={<CatChip cat={t.cat} size={26} r={8} />} />
          <DetailRow label="Account" value={a.name} chip={<div style={{ width: 26, height: 26, borderRadius: 8, background: a.tint + '22', color: a.tint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={a.icon} size={15} /></div>} />
          <DetailRow label="When" value={t.date + ' · ' + t.time} />
          {t.note && <DetailRow label="Note" value={t.note} last />}
        </Card>

        {t.source === 'sms' && (
          <div style={{ padding: 14, borderRadius: 'var(--r)', background: 'var(--accent-soft)', border: '1px solid rgba(34,197,94,0.22)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
              <Icon name="sparkles" size={16} color="var(--accent)" sw={2.2} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent)' }}>Auto-tagged from SMS</span>
              <div style={{ marginLeft: 'auto' }}><Conf value={t.confidence} /></div>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
              Matched "{t.merchant}" to <b style={{ color: 'var(--text)' }}>{c.label}</b> from past behaviour. Tap edit if this looks off — I'll learn from it.
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 9 }}>
          <Btn variant="ghost" icon="tag" full onClick={() => go('categories')}>Recategorize</Btn>
          <Btn variant="ghost" icon="split" full>Split</Btn>
        </div>
      </div>
    </div>
  );
};
const DetailRow = ({ label, value, chip, last }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 11px', borderBottom: last ? 'none' : '1px solid var(--border)' }}>
    {chip}
    <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{label}</span>
    <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 500, textAlign: 'right' }}>{value}</span>
  </div>
);

// ── Add account flow ─────────────────────────────────────────
const AddAccount = ({ go }) => {
  const [picked, setPicked] = useStateM(null);
  const opts = [
    { id: 'mtn', name: 'MTN MoMo', kind: 'Auto-read M-Money SMS', icon: 'phone', tint: '#FFCC00' },
    { id: 'airtel', name: 'Airtel Money', kind: 'Auto-read SMS', icon: 'phone', tint: '#E40000' },
    { id: 'bk', name: 'Bank of Kigali', kind: 'Read BK alerts', icon: 'bank', tint: '#1E73BE' },
    { id: 'equity', name: 'Equity Bank', kind: 'Read SMS alerts', icon: 'card', tint: '#E2231A' },
    { id: 'cash', name: 'Cash wallet', kind: 'Track manually', icon: 'coins', tint: '#22C55E' },
  ];
  return (
    <div className="screen-in">
      <ScreenHeader title="Add an account" sub="Connect once — AI reads the rest" onBack={() => go('accounts')} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ padding: 14, borderRadius: 'var(--r)', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="message" size={20} /></div>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
            Grant SMS read access and FinXAI quietly turns your <b style={{ color: 'var(--text)' }}>MoMo & bank notifications</b> into clean records. Nothing leaves your phone unencrypted.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {opts.map(o => (
            <Card key={o.id} onClick={() => setPicked(o.id)} pad={13} style={{ display: 'flex', alignItems: 'center', gap: 13, borderColor: picked === o.id ? 'var(--accent)' : 'var(--border)' }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: o.tint + '22', color: o.tint, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={o.icon} size={22} sw={2} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{o.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{o.kind}</div>
              </div>
              <div style={{ width: 22, height: 22, borderRadius: 99, border: '2px solid ' + (picked === o.id ? 'var(--accent)' : 'var(--border-2)'), background: picked === o.id ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {picked === o.id && <Icon name="check" size={13} sw={3} color="var(--accent-ink)" />}
              </div>
            </Card>
          ))}
        </div>
      </div>
      <div style={{ padding: '8px 16px calc(16px + env(safe-area-inset-bottom))' }}>
        <Btn variant={picked ? 'primary' : 'ghost'} full size="lg" icon="lock" onClick={() => picked && go('accounts')}>
          {picked ? 'Connect securely' : 'Choose an account'}
        </Btn>
      </div>
    </div>
  );
};

Object.assign(window, { RecordsScreen, AccountsScreen, AccountDetail, TxnDetail, AddAccount, IconBtn, SummaryTile });
