// screens-budgetx.jsx — Budgets hub, party/shared budget detail, create, schedule
const { useState: useStateB } = React;

// avatar stack
const Stack = ({ people, size = 28 }) => (
  <div style={{ display: 'flex' }}>
    {people.map((p, i) => (
      <div key={i} style={{ marginLeft: i ? -8 : 0, border: '2px solid var(--surface)', borderRadius: '50%' }}>
        <Avatar initials={p.initials} tint={p.tint} size={size} />
      </div>
    ))}
  </div>
);

// ── Budgets hub ──────────────────────────────────────────────
const BudgetsHub = ({ go }) => {
  const [tab, setTab] = useStateB('spending');
  const pct = Math.round(budgetTotal.spent / budgetTotal.limit * 100);
  const left = budgetTotal.limit - budgetTotal.spent;
  return (
    <div className="screen-in" style={{ paddingBottom: 24 }}>
      <div style={{ padding: '14px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Budgets</h2>
          <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>May 2026 · resets in 1 day</div>
        </div>
        <Btn variant="soft" size="sm" icon="plus" onClick={() => go('create-budget')}>Create</Btn>
      </div>

      {/* tabs */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px 12px' }}>
        {[['spending', 'My spending'], ['shared', 'Shared & goals']].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} className="press" style={{ flex: 1, padding: '9px 0', borderRadius: 11, border: '1px solid ' + (tab === id ? 'transparent' : 'var(--border)'), fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: tab === id ? 'var(--accent)' : 'var(--surface-2)', color: tab === id ? 'var(--accent-ink)' : 'var(--text-2)' }}>{l}</button>
        ))}
      </div>

      {tab === 'spending' && (
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ borderRadius: 'var(--r-lg)', padding: 18, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 18 }}>
            <Ring pct={pct} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>Left to spend</div>
              <div className="tabnum" style={{ fontSize: 24, fontWeight: 700, color: left < 0 ? 'var(--expense)' : 'var(--text)' }}>{fmt(left)}<span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 4 }}>RWF</span></div>
              <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 4 }}><span className="tabnum">{fmt(budgetTotal.spent)}</span> of <span className="tabnum">{fmt(budgetTotal.limit)}</span> spent</div>
            </div>
          </div>
          <div style={{ padding: 13, borderRadius: 'var(--r)', background: 'rgba(251,113,133,0.1)', border: '1px solid rgba(251,113,133,0.25)', display: 'flex', gap: 11, alignItems: 'flex-start' }}>
            <Icon name="alert" size={19} color="var(--expense)" style={{ marginTop: 1 }} />
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}><b style={{ color: 'var(--text)' }}>Entertainment</b> is over by 3,000. AI suggests moving 3,000 from Transport.</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {BUDGETS.map(b => {
              const c = CATS[b.cat]; const p = Math.round(b.spent / b.limit * 100); const over = b.spent > b.limit;
              return (
                <Card key={b.cat} pad={13}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 9 }}>
                    <CatChip cat={b.cat} size={34} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{c.label}</div>
                      <div className="tabnum" style={{ fontSize: 11, color: 'var(--text-2)' }}>{fmt(b.spent)} / {fmt(b.limit)} RWF</div>
                    </div>
                    <span className="tabnum" style={{ fontSize: 12.5, fontWeight: 700, color: over ? 'var(--expense)' : p > 85 ? 'var(--warn)' : 'var(--text-2)' }}>{p}%</span>
                  </div>
                  <Progress value={b.spent} max={b.limit} color={c.color} />
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'shared' && (
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ padding: 13, borderRadius: 'var(--r)', background: 'linear-gradient(135deg, rgba(244,114,182,0.13), rgba(244,114,182,0.03))', border: '1px solid rgba(244,114,182,0.22)', display: 'flex', gap: 11 }}>
            <Icon name="users" size={19} color="#F472B6" style={{ marginTop: 1 }} />
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>Pool money with others for a <b style={{ color: 'var(--text)' }}>party, household, or goal</b> — everyone contributes, AI links expenses as they happen.</div>
          </div>
          {BUDGET_GROUPS.map(g => {
            const pc = Math.round(g.spent / g.target * 100);
            const typeLabel = g.type === 'party' ? 'Party' : g.type === 'goal' ? 'Goal' : 'Shared';
            return (
              <Card key={g.id} onClick={() => go('budget-group', { id: g.id })} pad={14}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 13, background: g.tint + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, flexShrink: 0 }}>{g.emoji}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
                      {g.name}
                      <Pill size={9} color={g.tint} bg={g.tint + '20'}>{typeLabel}</Pill>
                      {g.recurring && <Icon name="repeat" size={13} color="var(--text-3)" />}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{g.date}</div>
                  </div>
                  <Stack people={g.contributors} />
                </div>
                <div style={{ marginTop: 12 }}>
                  <Progress value={g.spent} max={g.target} color={g.tint} h={7} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7, fontSize: 11.5 }}>
                    <span className="tabnum" style={{ color: 'var(--text)', fontWeight: 600 }}>{fmt(g.spent)} <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>/ {fmt(g.target)}</span></span>
                    <span style={{ color: 'var(--text-2)' }}>{g.type === 'goal' ? pc + '% saved' : pc + '% of pool'}</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── Party / shared budget detail ─────────────────────────────
const BudgetGroupDetail = ({ go, params }) => {
  const g = BUDGET_GROUPS.find(x => x.id === params.id) || BUDGET_GROUPS[0];
  const pooled = g.contributors.reduce((s, c) => s + c.amount, 0);
  const pc = Math.round(g.spent / g.target * 100);
  const isGoal = g.type === 'goal';
  return (
    <div className="screen-in" style={{ paddingBottom: 24 }}>
      <ScreenHeader title={g.name} sub={(g.type === 'party' ? 'Party budget' : g.type === 'goal' ? 'Savings goal' : 'Shared budget') + (g.recurring ? ' · recurring' : '')} onBack={() => go('budget')} right={<IconBtn icon="share" />} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ borderRadius: 'var(--r-lg)', padding: 18, background: `radial-gradient(140% 120% at 100% 0%, ${g.tint}26, var(--surface) 60%)`, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{isGoal ? 'Saved so far' : 'Spent of pool'}</span>
            <div style={{ width: 40, height: 40, borderRadius: 13, background: g.tint + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{g.emoji}</div>
          </div>
          <div className="tabnum" style={{ fontSize: 30, fontWeight: 700, marginTop: 6 }}>{fmt(g.spent)}<span style={{ fontSize: 14, color: 'var(--text-3)', marginLeft: 5 }}>/ {fmt(g.target)}</span></div>
          <div style={{ marginTop: 12 }}><Progress value={g.spent} max={g.target} color={g.tint} h={8} /></div>
          <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 8 }}>
            {isGoal ? `${pc}% there · ${g.date}` : `${pc}% used · pooled ${fmt(pooled)} from ${g.contributors.length}`}
          </div>
        </div>

        {/* contributors */}
        <div>
          <SectionHeader title={isGoal ? 'Auto-save' : 'Contributors'} action="Invite" onAction={() => {}} />
          <Card pad={6}>
            {g.contributors.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 9px', borderBottom: i < g.contributors.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <Avatar initials={c.initials} tint={c.tint} size={34} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{c.name}{c.name === 'Fabrice' && <span style={{ color: 'var(--text-3)', fontWeight: 400 }}> · you</span>}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{isGoal ? '50,000 / month' : 'contributed'}</div>
                </div>
                <div className="tabnum" style={{ fontSize: 13, fontWeight: 600, color: 'var(--income)' }}>{fmt(c.amount)}</div>
              </div>
            ))}
          </Card>
        </div>

        {/* linked expenses */}
        {!isGoal && (
          <div>
            <SectionHeader title="Linked expenses" action="Link more" onAction={() => go('records')} />
            <Card pad={6}>
              {g.linked.map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 9px', borderBottom: i < g.linked.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <CatChip cat={t.cat} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{t.merchant}</div>
                    <div style={{ fontSize: 11, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="sparkles" size={11} /> auto-linked</div>
                  </div>
                  <Money amount={t.amount} size={13} />
                </div>
              ))}
            </Card>
          </div>
        )}

        <div style={{ display: 'flex', gap: 9 }}>
          <Btn variant="ghost" full icon="plus" onClick={() => go('add-txn')}>{isGoal ? 'Add savings' : 'Add expense'}</Btn>
          <Btn variant="soft" full icon="userPlus" onClick={() => {}}>Invite</Btn>
        </div>
      </div>
    </div>
  );
};

// ── Create budget ────────────────────────────────────────────
const CreateBudget = ({ go }) => {
  const [type, setType] = useStateB('shared');
  const [recurring, setRecurring] = useStateB(true);
  const [freq, setFreq] = useStateB('Monthly');
  const types = [
    { id: 'spending', emoji: '📊', name: 'Category budget', sub: 'Cap spending per category' },
    { id: 'shared', emoji: '🏠', name: 'Shared budget', sub: 'Co-manage with family' },
    { id: 'party', emoji: '🎉', name: 'Party / event', sub: 'Pool money for an occasion' },
    { id: 'goal', emoji: '🛟', name: 'Savings goal', sub: 'Auto-save toward a target' },
  ];
  return (
    <div className="screen-in" style={{ paddingBottom: 24 }}>
      <ScreenHeader title="Create a budget" onBack={() => go('budget')} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {types.map(ty => (
            <button key={ty.id} onClick={() => setType(ty.id)} className="press" style={{ textAlign: 'left', padding: 13, borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', background: type === ty.id ? 'var(--accent-soft)' : 'var(--surface)', border: '1px solid ' + (type === ty.id ? 'rgba(34,197,94,0.4)' : 'var(--border)'), color: 'var(--text)' }}>
              <div style={{ fontSize: 22 }}>{ty.emoji}</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>{ty.name}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-2)', marginTop: 1 }}>{ty.sub}</div>
            </button>
          ))}
        </div>

        <Card pad={0}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 14px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>Name</span>
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>{type === 'party' ? "Aline's Birthday 🎉" : type === 'goal' ? 'Emergency fund' : 'Household'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 14px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{type === 'goal' ? 'Target' : 'Limit / pool'}</span>
            <span className="tabnum" style={{ fontSize: 13.5, fontWeight: 500 }}>{type === 'goal' ? '1,000,000' : type === 'party' ? '250,000' : '400,000'} RWF</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 14px' }}>
            <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>Linked account</span>
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>Bank of Kigali</span>
          </div>
        </Card>

        {/* recurring */}
        <Card pad={14}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--surface-2)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="repeat" size={18} /></div>
              <div><div style={{ fontSize: 13, fontWeight: 600 }}>Recurring</div><div style={{ fontSize: 11, color: 'var(--text-2)' }}>Auto-reset each period</div></div>
            </div>
            <button onClick={() => setRecurring(v => !v)} className="press" style={{ width: 46, height: 28, borderRadius: 99, border: 'none', cursor: 'pointer', background: recurring ? 'var(--accent)' : 'var(--surface-3)', position: 'relative', transition: 'background .2s' }}>
              <span style={{ position: 'absolute', top: 3, left: recurring ? 21 : 3, width: 22, height: 22, borderRadius: 99, background: '#fff', transition: 'left .2s' }} />
            </button>
          </div>
          {recurring && (
            <div style={{ display: 'flex', gap: 8, marginTop: 13 }}>
              {['Weekly', 'Monthly', 'Yearly'].map(f => (
                <button key={f} onClick={() => setFreq(f)} className="press" style={{ flex: 1, padding: '8px 0', borderRadius: 10, fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: freq === f ? 'var(--accent-soft)' : 'var(--surface-2)', color: freq === f ? 'var(--accent)' : 'var(--text-2)', border: '1px solid ' + (freq === f ? 'rgba(34,197,94,0.3)' : 'var(--border)') }}>{f}</button>
              ))}
            </div>
          )}
        </Card>

        {(type === 'shared' || type === 'party') && (
          <Card pad={14}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Invite people</div>
              <Btn variant="soft" size="sm" icon="userPlus" onClick={() => {}}>Add</Btn>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
              <Stack people={[{ initials: 'F', tint: '#22C55E' }, { initials: 'AU', tint: '#F472B6' }]} />
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>You & Aline</span>
            </div>
          </Card>
        )}

        <Btn variant="primary" full size="lg" icon="check" onClick={() => go('budget')}>Create budget</Btn>
      </div>
    </div>
  );
};

// ── Schedule (agenda) ────────────────────────────────────────
const ScheduleScreen = ({ go }) => {
  const [pay, setPay] = useStateB(null);
  const days = ['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15'];
  const active = SCHEDULE.map(s => s.day);
  const [sel, setSel] = useStateB('05');
  return (
    <div className="screen-in" style={{ paddingBottom: 24 }}>
      <ScreenHeader title="Schedule" sub="June 2026 · upcoming money" onBack={() => go('home')} right={<IconBtn icon="plus" color="var(--accent)" onClick={() => go('add-debt')} />} />

      {/* week strip */}
      <div style={{ display: 'flex', gap: 7, overflowX: 'auto', padding: '6px 16px 12px', scrollbarWidth: 'none' }}>
        {days.map(d => {
          const has = active.includes(d); const on = sel === d;
          return (
            <button key={d} onClick={() => setSel(d)} className="press" style={{ flexShrink: 0, width: 44, padding: '9px 0', borderRadius: 13, border: '1px solid ' + (on ? 'transparent' : 'var(--border)'), background: on ? 'var(--accent)' : 'var(--surface-2)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 9, color: on ? 'var(--accent-ink)' : 'var(--text-3)' }}>{['S','M','T','W','T','F','S'][(parseInt(d) + 0) % 7]}</span>
              <span className="tabnum" style={{ fontSize: 15, fontWeight: 700, color: on ? 'var(--accent-ink)' : 'var(--text)' }}>{d}</span>
              <span style={{ width: 5, height: 5, borderRadius: 5, background: has ? (on ? 'var(--accent-ink)' : 'var(--accent)') : 'transparent' }} />
            </button>
          );
        })}
      </div>

      <div style={{ padding: '0 16px' }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <SummaryTile label="Due this week" value={-221700} color="var(--expense)" icon="upRight" />
          <SummaryTile label="Coming in" value={670000} color="var(--income)" icon="downLeft" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {SCHEDULE.map(s => (
            <div key={s.day}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 4px 7px' }}>
                <span className="tabnum" style={{ fontSize: 14, fontWeight: 700 }}>{s.day} Jun</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{s.dow}</span>
              </div>
              <Card pad={6}>
                {s.items.map((it, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 10px', borderBottom: i < s.items.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ width: 38, height: 38, borderRadius: 12, background: it.tint + '22', color: it.tint, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={it.icon} size={20} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{it.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{it.sub}</div>
                    </div>
                    {it.payable
                      ? <button onClick={() => setPay(it)} className="press" style={{ padding: '6px 12px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, background: 'var(--accent-soft)', color: 'var(--accent)' }}>Pay</button>
                      : <Money amount={it.amount} size={13} />}
                  </div>
                ))}
              </Card>
            </div>
          ))}
        </div>
      </div>

      <PaySheet open={!!pay} onClose={() => setPay(null)} amount={pay ? pay.amount : 0} label={pay ? pay.title : ''} />
    </div>
  );
};

Object.assign(window, { BudgetsHub, BudgetGroupDetail, CreateBudget, ScheduleScreen });
