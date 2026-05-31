// screens-home.jsx — redesigned Home dashboard
const HomeScreen = ({ go }) => {
  const income = TXNS.filter(t => t.amount > 0 && (t.date === 'Today' || t.date === 'Yesterday')).reduce((s, t) => s + t.amount, 0);
  const spent = TXNS.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const recent = TXNS.slice(0, 5);
  const quick = [
    { id: 'debt', label: 'Debt', icon: 'coins', tint: '#34D399' },
    { id: 'shopping', label: 'Shopping', icon: 'cart', tint: '#22C55E' },
    { id: 'shared', label: 'Shared', icon: 'users', tint: '#60A5FA' },
    { id: 'schedule', label: 'Schedule', icon: 'calendar', tint: '#FBBF24' },
  ];
  // mini weekly spend bars
  const week = [22, 41, 18, 35, 64, 12, 48];

  return (
    <div className="screen-in" style={{ paddingBottom: 24 }}>
      <TopBar onBell={() => go('notifications')} onProfile={() => go('profile')} />

      <div style={{ padding: '6px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* AI sync status */}
        <div onClick={() => go('sms')} className="press" style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 'var(--r)',
          background: 'linear-gradient(135deg, rgba(34,197,94,0.16), rgba(34,197,94,0.04))',
          border: '1px solid rgba(34,197,94,0.22)',
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            background: 'rgba(34,197,94,0.2)', color: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><Icon name="sparkles" size={22} sw={2.2} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>AI sorted 11 SMS for you</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>
              <b style={{ color: 'var(--accent)' }}>{SMS_QUEUE.length} need a quick check</b> · synced 2 min ago
            </div>
          </div>
          <div style={{
            width: 34, height: 34, borderRadius: 10, background: 'var(--accent)', color: 'var(--accent-ink)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}><Icon name="chevronRight" size={20} sw={2.6} /></div>
        </div>

        {/* Net balance hero */}
        <div style={{
          borderRadius: 'var(--r-lg)', padding: '18px 18px 16px', position: 'relative', overflow: 'hidden',
          background: 'radial-gradient(140% 120% at 0% 0%, rgba(34,197,94,0.18), rgba(26,31,36,0.4) 55%), var(--surface)',
          border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="eye" size={14} color="var(--text-3)" /> Total balance
            </span>
            <Pill icon="trendUp" color="var(--accent)" bg="var(--accent-soft)">+3.4% this month</Pill>
          </div>
          <div className="tabnum" style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.5, marginTop: 8, lineHeight: 1 }}>
            {fmt(totalBalance)}<span style={{ fontSize: 16, color: 'var(--text-3)', fontWeight: 600, marginLeft: 6 }}>RWF</span>
          </div>

          {/* in / out */}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            {[
              { l: 'Income', v: income, icon: 'downLeft', c: 'var(--income)' },
              { l: 'Spent', v: -spent, icon: 'upRight', c: 'var(--expense)' },
            ].map((x) => (
              <div key={x.l} style={{
                flex: 1, display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px',
                background: 'rgba(255,255,255,0.04)', borderRadius: 12, border: '1px solid var(--border)',
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 9, background: x.c + '22', color: x.c,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}><Icon name={x.icon} size={16} sw={2.4} /></div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, color: 'var(--text-2)' }}>{x.l}</div>
                  <div className="tabnum" style={{ fontSize: 13, fontWeight: 600, color: x.c }}>{fmt(x.v)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Accounts */}
        <div>
          <SectionHeader title="Accounts" action="See all" onAction={() => go('accounts')} />
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', margin: '0 -16px', padding: '0 16px 4px', scrollbarWidth: 'none' }}>
            {ACCOUNTS.map((a) => (
              <div key={a.id} onClick={() => go('account', { id: a.id })} className="press" style={{
                width: 152, flexShrink: 0, padding: 13, borderRadius: 'var(--r)',
                background: 'var(--surface)', border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 9, background: a.tint + '22', color: a.tint,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}><Icon name={a.icon} size={18} sw={2.1} /></div>
                  {a.shared && <Icon name="users" size={14} color="var(--text-3)" />}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 2 }}>{a.name}</div>
                <div className="tabnum" style={{ fontSize: 16, fontWeight: 700 }}>{fmt(a.balance)}
                  <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 500, marginLeft: 3 }}>RWF</span>
                </div>
              </div>
            ))}
            <div onClick={() => go('add-account')} className="press" style={{
              width: 100, flexShrink: 0, borderRadius: 'var(--r)', border: '1.5px dashed var(--border-2)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
              color: 'var(--text-2)',
            }}>
              <div style={{ width: 34, height: 34, borderRadius: 11, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="plus" size={20} sw={2.4} color="var(--accent)" />
              </div>
              <span style={{ fontSize: 11, fontWeight: 600 }}>Add</span>
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          {quick.map((q) => (
            <button key={q.id} onClick={() => go(q.id)} className="press" style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
              padding: '12px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
              color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 12, background: q.tint + '1f', color: q.tint,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><Icon name={q.icon} size={20} sw={2.1} /></div>
              <span style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--text-2)' }}>{q.label}</span>
            </button>
          ))}
        </div>

        {/* AI coach nudge */}
        <div onClick={() => go('ai')} className="press" style={{
          padding: 14, borderRadius: 'var(--r)', background: 'var(--surface)',
          border: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          <Avatar initials="" tint="#34D399" size={34} />
          <div style={{ flex: 1, marginTop: -1 }}>
            <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="sparkles" size={13} sw={2.2} /> AI Coach
            </div>
            <div style={{ fontSize: 13, marginTop: 3, lineHeight: 1.45 }}>
              You spent <b>71,200</b> on dining — 89% of budget with 1 day left. Cook at home this weekend to stay green. 🍲
            </div>
          </div>
        </div>

        {/* Recent transactions */}
        <div>
          <SectionHeader title="Recent transactions" action="View all" onAction={() => go('records')} />
          <Card pad={6}>
            {recent.map((t, i) => <TxnRow key={t.id} t={t} go={go} divider={i < recent.length - 1} />)}
          </Card>
        </div>
      </div>
    </div>
  );
};

// Reusable transaction row
const TxnRow = ({ t, go, divider }) => {
  const c = CATS[t.cat];
  return (
    <div onClick={() => go && go('txn', { id: t.id })} className="press" style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '9px 10px',
      borderBottom: divider ? '1px solid var(--border)' : 'none',
    }}>
      <CatChip cat={t.cat} size={38} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.merchant}</div>
        <div style={{ fontSize: 11, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <span>{c.label}</span>
          {t.source === 'sms' && <><span style={{ color: 'var(--text-3)' }}>·</span><Icon name="sparkles" size={11} color="var(--accent)" /></>}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <Money amount={t.amount} size={13} />
        <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{t.time}</div>
      </div>
    </div>
  );
};

Object.assign(window, { HomeScreen, TxnRow });
