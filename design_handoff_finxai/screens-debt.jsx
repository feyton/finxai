// screens-debt.jsx — Debt & loans, repayment schedules, pay sheet
const { useState: useStateD } = React;

// ── Pay sheet: MoMo USSD prefill + bank API (future) ─────────
function PaySheet({ open, onClose, amount = 0, label = '', acctId }) {
  const [stage, setStage] = useStateD('choose'); // choose | ussd | done
  const ussd = `*182*1*1*${Math.abs(amount)}#`;
  React.useEffect(() => { if (open) setStage('choose'); }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title={stage === 'choose' ? `Pay ${fmt(amount)} RWF` : null}>
      {stage === 'choose' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {label && <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: -6, marginBottom: 2 }}>{label}</div>}
          <PayOption icon="phone" tint="#FFCC00" title="MTN Mobile Money" sub="Prefill USSD — confirm with your PIN" onClick={() => setStage('ussd')} />
          <PayOption icon="phone" tint="#E40000" title="Airtel Money" sub="Prefill USSD code" onClick={() => setStage('ussd')} />
          <PayOption icon="bank" tint="#1E73BE" title="Bank of Kigali" sub="Direct transfer via bank API" soon />
          <PayOption icon="card" tint="#E2231A" title="Equity Bank" sub="Direct transfer via bank API" soon />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px', color: 'var(--text-3)', fontSize: 11 }}>
            <Icon name="lock" size={13} /> Payments are confirmed on your phone — FinXAI never holds funds.
          </div>
        </div>
      )}
      {stage === 'ussd' && (
        <div style={{ textAlign: 'center', padding: '4px 0 6px' }}>
          <div style={{ width: 56, height: 56, margin: '0 auto 14px', borderRadius: 18, background: 'rgba(255,204,0,0.16)', color: '#FFCC00', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="phone" size={28} /></div>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>Dialer prefilled</div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.5 }}>Press call to send this USSD request, then enter your MoMo PIN to confirm.</div>
          <div className="mono" style={{ margin: '16px auto', padding: '14px', borderRadius: 14, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 20, fontWeight: 600, letterSpacing: 1 }}>{ussd}</div>
          <div style={{ display: 'flex', gap: 9 }}>
            <Btn variant="ghost" full onClick={onClose}>Cancel</Btn>
            <Btn variant="primary" full icon="phone" onClick={() => setStage('done')}>Call</Btn>
          </div>
        </div>
      )}
      {stage === 'done' && (
        <div style={{ textAlign: 'center', padding: '8px 0 10px' }}>
          <div style={{ width: 60, height: 60, margin: '0 auto 14px', borderRadius: 20, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="checkCircle" size={32} /></div>
          <div style={{ fontSize: 15.5, fontWeight: 600 }}>Payment recorded</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4 }}>AI will match the MoMo confirmation SMS and update your balance automatically.</div>
          <div style={{ marginTop: 18 }}><Btn variant="primary" full onClick={onClose}>Done</Btn></div>
        </div>
      )}
    </Sheet>
  );
}
const PayOption = ({ icon, tint, title, sub, onClick, soon }) => (
  <button onClick={soon ? undefined : onClick} className={soon ? '' : 'press'} style={{
    display: 'flex', alignItems: 'center', gap: 12, padding: 13, borderRadius: 14, width: '100%',
    background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)',
    fontFamily: 'inherit', textAlign: 'left', opacity: soon ? 0.55 : 1, cursor: soon ? 'default' : 'pointer',
  }}>
    <div style={{ width: 40, height: 40, borderRadius: 12, background: tint + '22', color: tint, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={icon} size={21} /></div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{sub}</div>
    </div>
    {soon ? <Pill size={9} color="var(--text-3)" bg="rgba(255,255,255,0.06)">Soon</Pill> : <Icon name="chevronRight" size={18} color="var(--text-3)" />}
  </button>
);

// ── Debt list ────────────────────────────────────────────────
const DebtScreen = ({ go }) => (
  <div className="screen-in" style={{ paddingBottom: 24 }}>
    <ScreenHeader title="Debts & loans" sub="Track what you owe & what's owed" onBack={() => go('home')} right={<IconBtn icon="plus" color="var(--accent)" onClick={() => go('add-debt')} />} />
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, padding: 14, borderRadius: 'var(--r)', background: 'linear-gradient(135deg, rgba(251,113,133,0.14), rgba(251,113,133,0.03))', border: '1px solid rgba(251,113,133,0.22)' }}>
          <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>You owe</div>
          <div className="tabnum" style={{ fontSize: 19, fontWeight: 700, color: 'var(--expense)', marginTop: 2 }}>{fmt(debtTotals.owe)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>RWF outstanding</div>
        </div>
        <div style={{ flex: 1, padding: 14, borderRadius: 'var(--r)', background: 'linear-gradient(135deg, rgba(52,211,153,0.14), rgba(52,211,153,0.03))', border: '1px solid rgba(52,211,153,0.22)' }}>
          <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>Owed to you</div>
          <div className="tabnum" style={{ fontSize: 19, fontWeight: 700, color: 'var(--income)', marginTop: 2 }}>{fmt(debtTotals.owed)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>RWF to collect</div>
        </div>
      </div>

      <div style={{ padding: 13, borderRadius: 'var(--r)', background: 'var(--accent-soft)', border: '1px solid rgba(34,197,94,0.22)', display: 'flex', gap: 11 }}>
        <Icon name="sparkles" size={19} color="var(--accent)" style={{ marginTop: 1 }} />
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
          Pay <b style={{ color: 'var(--text)' }}>20,000 extra</b> on your BK loan each month and you'll clear it <b style={{ color: 'var(--accent)' }}>2 months early</b>, saving ~31,000 in interest.
        </div>
      </div>

      <SectionHeader title="Active" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {DEBTS.map(d => {
          const prog = (d.principal - d.outstanding) / d.principal;
          return (
            <Card key={d.id} onClick={() => go('debt-detail', { id: d.id })} pad={14}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: d.tint + '22', color: d.tint, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={d.icon} size={22} sw={2} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
                    {d.party}
                    <Pill size={9} color={d.dir === 'borrowed' ? 'var(--expense)' : 'var(--income)'} bg={(d.dir === 'borrowed' ? 'rgba(251,113,133,' : 'rgba(52,211,153,') + '0.16)'}>{d.dir === 'borrowed' ? 'You owe' : 'Owed'}</Pill>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{d.sub}{d.rate ? ` · ${d.rate}% p.a.` : ''}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="tabnum" style={{ fontSize: 15, fontWeight: 700 }}>{fmt(d.outstanding)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)' }}>of {fmt(d.principal)}</div>
                </div>
              </div>
              <div style={{ marginTop: 11 }}>
                <Progress value={d.principal - d.outstanding} max={d.principal} color={d.tint} h={6} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--text-2)' }}>
                  <span>{Math.round(prog * 100)}% repaid</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="clock" size={12} /> Next {d.nextDue}</span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  </div>
);

// ── Debt detail w/ repayment schedule ────────────────────────
const DebtDetail = ({ go, params }) => {
  const d = DEBTS.find(x => x.id === params.id) || DEBTS[0];
  const [pay, setPay] = useStateD(false);
  const prog = (d.principal - d.outstanding) / d.principal;
  return (
    <div className="screen-in" style={{ paddingBottom: 24 }}>
      <ScreenHeader title={d.party} sub={d.sub} onBack={() => go('debt')} right={<IconBtn icon="pencil" />} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* summary */}
        <div style={{ borderRadius: 'var(--r-lg)', padding: 18, background: `radial-gradient(140% 120% at 0% 0%, ${d.tint}26, var(--surface) 60%)`, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{d.dir === 'borrowed' ? 'Outstanding balance' : 'Still owed to you'}</div>
          <div className="tabnum" style={{ fontSize: 30, fontWeight: 700, marginTop: 4 }}>{fmt(d.outstanding)}<span style={{ fontSize: 14, color: 'var(--text-3)', marginLeft: 5 }}>RWF</span></div>
          <div style={{ marginTop: 12 }}><Progress value={d.principal - d.outstanding} max={d.principal} color={d.tint} h={7} /></div>
          <div style={{ display: 'flex', gap: 18, marginTop: 14 }}>
            {[['Principal', fmt(d.principal)], ['Installment', fmt(d.installment)], ['Rate', d.rate ? d.rate + '%' : '—'], ['Cadence', d.frequency]].map(([k, v]) => (
              <div key={k}><div style={{ fontSize: 10, color: 'var(--text-3)' }}>{k}</div><div className="tabnum" style={{ fontSize: 13, fontWeight: 600 }}>{v}</div></div>
            ))}
          </div>
        </div>

        {d.dir === 'borrowed' && (
          <Btn variant="primary" full size="lg" icon="phone" onClick={() => setPay(true)}>Pay installment · {fmt(d.installment)} RWF</Btn>
        )}

        {/* repayment schedule */}
        <div>
          <SectionHeader title="Repayment schedule" action={`${d.paid}/${d.term} paid`} onAction={() => {}} />
          <Card pad={0}>
            {d.schedule.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '11px 14px', borderBottom: i < d.schedule.length - 1 ? '1px solid var(--border)' : 'none' }}>
                {/* timeline dot */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: s.status === 'paid' ? 'var(--accent)' : s.status === 'due' ? 'rgba(251,191,36,0.2)' : 'var(--surface-2)',
                    border: '1px solid ' + (s.status === 'due' ? 'var(--warn)' : 'var(--border-2)') }}>
                    {s.status === 'paid' ? <Icon name="check" size={12} sw={3} color="var(--accent-ink)" /> : <span style={{ fontSize: 10, fontWeight: 700, color: s.status === 'due' ? 'var(--warn)' : 'var(--text-3)' }}>{s.n}</span>}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Installment {s.n}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{s.label}</div>
                </div>
                {s.status === 'due' && <Pill size={9} color="var(--warn)" bg="rgba(251,191,36,0.16)">Due next</Pill>}
                <div className="tabnum" style={{ fontSize: 13, fontWeight: 600, color: s.status === 'paid' ? 'var(--text-3)' : 'var(--text)', textDecoration: s.status === 'paid' ? 'line-through' : 'none' }}>{fmt(s.amount)}</div>
              </div>
            ))}
          </Card>
        </div>

        <div style={{ padding: 13, borderRadius: 'var(--r)', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', gap: 11 }}>
          <Icon name="sparkles" size={18} color="var(--accent)" style={{ marginTop: 1 }} />
          <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
            At {fmt(d.installment)}/mo you'll finish on <b style={{ color: 'var(--text)' }}>{d.schedule[d.schedule.length - 1].label}</b>. I'll remind you 2 days before each due date.
          </div>
        </div>
      </div>
      <PaySheet open={pay} onClose={() => setPay(false)} amount={-d.installment} label={`${d.party} · installment ${d.paid + 1}`} acctId={d.account} />
    </div>
  );
};

// ── Add / configure debt ─────────────────────────────────────
const AddDebt = ({ go }) => {
  const [dir, setDir] = useStateD('borrowed');
  const [freq, setFreq] = useStateD('Monthly');
  const field = (label, val, mono) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 14px', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{label}</span>
      <span className={mono ? 'tabnum' : ''} style={{ fontSize: 13.5, fontWeight: 500, color: val ? 'var(--text)' : 'var(--text-3)' }}>{val || 'Tap to set'}</span>
    </div>
  );
  return (
    <div className="screen-in" style={{ paddingBottom: 24 }}>
      <ScreenHeader title="New debt or loan" onBack={() => go('debt')} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 8, padding: 4, background: 'var(--surface-2)', borderRadius: 13, border: '1px solid var(--border)' }}>
          {[['borrowed', 'I borrowed'], ['lent', 'I lent']].map(([id, l]) => (
            <button key={id} onClick={() => setDir(id)} className="press" style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: dir === id ? 'var(--accent)' : 'transparent', color: dir === id ? 'var(--accent-ink)' : 'var(--text-2)' }}>{l}</button>
          ))}
        </div>
        <Card pad={0}>
          {field('Counterparty', dir === 'borrowed' ? 'Bank of Kigali' : 'Jean Bosco')}
          {field('Principal amount', '1,500,000 RWF', true)}
          {field('Interest rate', '16% p.a.', true)}
          {field('Linked account', 'Bank of Kigali')}
        </Card>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 9 }}>Repayment cadence</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['Weekly', 'Monthly', 'One-off'].map(f => (
              <button key={f} onClick={() => setFreq(f)} className="press" style={{ flex: 1, padding: '10px 0', borderRadius: 11, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: freq === f ? 'var(--accent-soft)' : 'var(--surface-2)', color: freq === f ? 'var(--accent)' : 'var(--text-2)', border: '1px solid ' + (freq === f ? 'rgba(34,197,94,0.3)' : 'var(--border)') }}>{f}</button>
            ))}
          </div>
        </div>
        <Card pad={0}>
          {field('Installment', '142,000 RWF', true)}
          {field('First due date', '5 Jun 2026')}
          {field('Number of payments', '12', true)}
        </Card>
        <div style={{ padding: 12, borderRadius: 'var(--r)', background: 'var(--accent-soft)', border: '1px solid rgba(34,197,94,0.22)', display: 'flex', gap: 10, alignItems: 'center' }}>
          <Icon name="sparkles" size={17} color="var(--accent)" />
          <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>AI will auto-build the full schedule and feed reminders & repayment matching from your SMS.</div>
        </div>
        <Btn variant="primary" full size="lg" icon="check" onClick={() => go('debt')}>Create & build schedule</Btn>
      </div>
    </div>
  );
};

Object.assign(window, { PaySheet, DebtScreen, DebtDetail, AddDebt });
