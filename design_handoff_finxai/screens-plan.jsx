// screens-plan.jsx — Budget, Shopping, Shared, SMS review, Categories
const { useState: useStateP } = React;

// ── Budget planner ───────────────────────────────────────────
const BudgetScreen = ({ go }) => {
  const pct = Math.round(budgetTotal.spent / budgetTotal.limit * 100);
  const left = budgetTotal.limit - budgetTotal.spent;
  return (
    <div className="screen-in" style={{ paddingBottom: 24 }}>
      <div style={{ padding: '14px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Budget</h2>
          <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>May 2026 · resets in 1 day</div>
        </div>
        <Btn variant="soft" size="sm" icon="sparkles" onClick={() => go('ai')}>Auto-plan</Btn>
      </div>

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* ring summary */}
        <div style={{ borderRadius: 'var(--r-lg)', padding: 18, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 18 }}>
          <Ring pct={pct} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>Left to spend</div>
            <div className="tabnum" style={{ fontSize: 24, fontWeight: 700, color: left < 0 ? 'var(--expense)' : 'var(--text)' }}>{fmt(left)}<span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 4 }}>RWF</span></div>
            <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 4 }}>
              <span className="tabnum">{fmt(budgetTotal.spent)}</span> of <span className="tabnum">{fmt(budgetTotal.limit)}</span> spent
            </div>
          </div>
        </div>

        {/* AI nudge */}
        <div style={{ padding: 13, borderRadius: 'var(--r)', background: 'rgba(251,113,133,0.1)', border: '1px solid rgba(251,113,133,0.25)', display: 'flex', gap: 11, alignItems: 'flex-start' }}>
          <Icon name="alert" size={19} color="var(--expense)" style={{ marginTop: 1 }} />
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
            <b style={{ color: 'var(--text)' }}>Entertainment</b> is over by 3,000. The AI suggests trimming Canal+ or moving 3,000 from Transport (you're under there).
          </div>
        </div>

        <SectionHeader title="By category" action="Edit" onAction={() => {}} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {BUDGETS.map(b => {
            const c = CATS[b.cat];
            const p = Math.round(b.spent / b.limit * 100);
            const over = b.spent > b.limit;
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
        <Btn variant="ghost" full icon="plus" onClick={() => {}}>Add a budget category</Btn>
      </div>
    </div>
  );
};

const Ring = ({ pct }) => {
  const r = 30, C = 2 * Math.PI * r;
  const over = pct > 100;
  const off = C - Math.min(pct, 100) / 100 * C;
  return (
    <div style={{ position: 'relative', width: 78, height: 78, flexShrink: 0 }}>
      <svg width="78" height="78" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="39" cy="39" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
        <circle cx="39" cy="39" r={r} fill="none" stroke={over ? 'var(--expense)' : 'var(--accent)'} strokeWidth="8"
          strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} style={{ transition: 'stroke-dashoffset .8s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span className="tabnum" style={{ fontSize: 17, fontWeight: 700 }}>{pct}%</span>
        <span style={{ fontSize: 9, color: 'var(--text-3)' }}>used</span>
      </div>
    </div>
  );
};

// ── Shopping lists ───────────────────────────────────────────
const ShoppingScreen = ({ go }) => {
  const [lists, setLists] = useStateP(SHOPPING);
  const toggle = (li, ii) => setLists(ls => ls.map((l, x) => x !== li ? l : { ...l, items: l.items.map((it, y) => y !== ii ? it : { ...it, done: !it.done }) }));

  return (
    <div className="screen-in" style={{ paddingBottom: 24 }}>
      <ScreenHeader title="Shopping lists" sub="Plan spend before you shop" onBack={() => go('home')} right={<IconBtn icon="plus" color="var(--accent)" />} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {lists.map((l, li) => {
          const total = l.items.reduce((s, it) => s + it.est, 0);
          const got = l.items.filter(it => it.done).length;
          return (
            <Card key={l.id} pad={0}>
              <div style={{ padding: '13px 14px 11px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 11, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="cart" size={20} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
                    {l.name}
                    {l.shared && <Pill icon="users" size={9} color="var(--info)" bg="rgba(96,165,250,0.16)">{l.with}</Pill>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{got}/{l.items.length} done · est. <span className="tabnum">{fmt(total)}</span> RWF</div>
                </div>
              </div>
              <div style={{ padding: 6 }}>
                {l.items.map((it, ii) => (
                  <div key={ii} onClick={() => toggle(li, ii)} className="press" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 9px' }}>
                    <div style={{ width: 22, height: 22, borderRadius: 7, border: '2px solid ' + (it.done ? 'var(--accent)' : 'var(--border-2)'), background: it.done ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {it.done && <Icon name="check" size={13} sw={3} color="var(--accent-ink)" />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, textDecoration: it.done ? 'line-through' : 'none', color: it.done ? 'var(--text-3)' : 'var(--text)' }}>{it.t}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 7 }}>×{it.q}</span>
                    </div>
                    <span className="tabnum" style={{ fontSize: 12, color: 'var(--text-2)' }}>{fmt(it.est)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 9px 5px', color: 'var(--text-3)' }}>
                  <Icon name="plus" size={17} /><span style={{ fontSize: 12.5 }}>Add item</span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

// ── Shared accounts ──────────────────────────────────────────
const SharedScreen = ({ go }) => (
  <div className="screen-in" style={{ paddingBottom: 24 }}>
    <ScreenHeader title="Shared & family" sub="Track money together, safely" onBack={() => go('home')} right={<IconBtn icon="userPlus" color="var(--accent)" />} />
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ padding: 14, borderRadius: 'var(--r)', background: 'linear-gradient(135deg, rgba(96,165,250,0.14), rgba(96,165,250,0.03))', border: '1px solid rgba(96,165,250,0.22)', display: 'flex', gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(96,165,250,0.2)', color: 'var(--info)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="shield" size={20} /></div>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
          Invite your spouse or family to <b style={{ color: 'var(--text)' }}>view or co-manage</b> a single account — for shared planning, not full access to everything.
        </div>
      </div>

      <SectionHeader title="People" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {SHARED.map(p => (
          <Card key={p.id} pad={14} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar initials={p.initials} tint={p.tint} size={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
                {p.name}
                {p.status === 'pending' && <Pill size={9} color="var(--warn)" bg="rgba(251,191,36,0.16)">Pending</Pill>}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{p.role} · {p.access}</div>
              <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
                {p.accounts.map(id => {
                  const a = ACCOUNTS.find(x => x.id === id);
                  return <Pill key={id} size={9} icon={a.icon} color={a.tint} bg={a.tint + '1c'}>{a.name}</Pill>;
                })}
              </div>
            </div>
            <Icon name="chevronRight" size={18} color="var(--text-3)" />
          </Card>
        ))}
      </div>

      <Btn variant="soft" full icon="userPlus" onClick={() => {}}>Invite someone</Btn>
    </div>
  </div>
);

// ── SMS auto-categorization review ───────────────────────────
const SmsReview = ({ go }) => {
  const [queue, setQueue] = useStateP(SMS_QUEUE);
  const [done, setDone] = useStateP(0);
  const act = (id) => { setQueue(q => q.filter(x => x.id !== id)); setDone(d => d + 1); };

  return (
    <div className="screen-in" style={{ paddingBottom: 24 }}>
      <ScreenHeader title="Review AI tags" sub={`${queue.length} to confirm · ${done} done`} onBack={() => go('home')} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ padding: 13, borderRadius: 'var(--r)', background: 'var(--accent-soft)', border: '1px solid rgba(34,197,94,0.22)', display: 'flex', gap: 11 }}>
          <Icon name="sparkles" size={19} color="var(--accent)" style={{ marginTop: 1 }} />
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
            I read these straight from your SMS. High-confidence ones are already saved — just glance & confirm these. Every fix trains your model.
          </div>
        </div>

        {queue.map(s => <SmsCard key={s.id} s={s} onConfirm={() => act(s.id)} onReject={() => act(s.id)} go={go} />)}

        {queue.length === 0 && (
          <div style={{ textAlign: 'center', padding: '36px 16px' }}>
            <div style={{ width: 64, height: 64, margin: '0 auto 14px', borderRadius: 20, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="checkCircle" size={34} /></div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>All sorted. Congz! 🎉</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4 }}>Everything's categorized and up to date.</div>
            <div style={{ marginTop: 18 }}><Btn variant="soft" icon="home" onClick={() => go('home')}>Back home</Btn></div>
          </div>
        )}
      </div>
    </div>
  );
};

const SmsCard = ({ s, onConfirm, onReject, go }) => {
  const c = CATS[s.ai.cat];
  const a = ACCOUNTS.find(x => x.id === s.ai.acct);
  return (
    <Card pad={0} style={{ overflow: 'hidden', animation: 'popIn .3s ease' }}>
      {/* raw sms */}
      <div style={{ padding: '12px 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
          <div style={{ width: 22, height: 22, borderRadius: 7, background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="message" size={13} color="var(--text-2)" /></div>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-2)' }}>{s.sender}</span>
          <span style={{ fontSize: 10.5, color: 'var(--text-3)', marginLeft: 'auto' }}>{s.when}</span>
        </div>
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-3)', lineHeight: 1.55 }}>{s.raw}</div>
      </div>
      {/* ai interpretation */}
      <div style={{ padding: 13 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <CatChip cat={s.ai.cat} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.ai.merchant}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{c.label}</span>
              <span style={{ color: 'var(--text-3)', fontSize: 11 }}>·</span>
              <span style={{ fontSize: 11, color: a.tint }}>{a.name}</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <Money amount={s.ai.amount} size={14} />
            <div style={{ marginTop: 3 }}><Conf value={s.ai.confidence} /></div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 13 }}>
          <Btn variant="ghost" size="sm" icon="pencil" full onClick={() => go('categories')}>Fix</Btn>
          <Btn variant="primary" size="sm" icon="check" full onClick={onConfirm}>Confirm</Btn>
        </div>
      </div>
    </Card>
  );
};

// ── Categories manager ───────────────────────────────────────
const CategoriesScreen = ({ go }) => {
  const counts = {};
  TXNS.forEach(t => { counts[t.cat] = (counts[t.cat] || 0) + 1; });
  return (
    <div className="screen-in" style={{ paddingBottom: 24 }}>
      <ScreenHeader title="Categories" sub="How AI labels your spending" onBack={() => go('home')} right={<IconBtn icon="plus" color="var(--accent)" />} />
      <div style={{ padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {Object.values(CATS).map(c => (
            <Card key={c.id} pad={13} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <CatChip cat={c.id} size={38} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{counts[c.id] || 0} this month</div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Planned (recurring / upcoming) ───────────────────────────
const PlannedScreen = ({ go }) => {
  const upcoming = [
    { m: 'House Rent', cat: 'rent', amount: -250000, when: 'in 1 day', auto: true },
    { m: 'Canal+ Rwanda', cat: 'fun', amount: -18000, when: 'in 4 days', auto: true },
    { m: 'Salary — Rw Tech', cat: 'salary', amount: 620000, when: 'in 5 days', auto: true },
    { m: 'School fees — Term 2', cat: 'education', amount: -85000, when: 'in 12 days', auto: false },
    { m: 'WASAC Water', cat: 'utilities', amount: -6700, when: 'in 18 days', auto: true },
  ];
  return (
    <div className="screen-in" style={{ paddingBottom: 24 }}>
      <ScreenHeader title="Planned" sub="Upcoming & recurring money" onBack={() => go('home')} right={<IconBtn icon="plus" color="var(--accent)" />} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ borderRadius: 'var(--r)', padding: 15, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
          <div><div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>Due this week</div><div className="tabnum" style={{ fontSize: 19, fontWeight: 700, color: 'var(--expense)' }}>-268,000</div></div>
          <div style={{ textAlign: 'right' }}><div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>Coming in</div><div className="tabnum" style={{ fontSize: 19, fontWeight: 700, color: 'var(--income)' }}>+620,000</div></div>
        </div>
        <Card pad={6}>
          {upcoming.map((u, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px', borderBottom: i < upcoming.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <CatChip cat={u.cat} size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{u.m}</div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Icon name="clock" size={11} /> {u.when}{u.auto && <><span style={{ color: 'var(--text-3)' }}>·</span><Icon name="repeat" size={11} color="var(--accent)" /> auto</>}
                </div>
              </div>
              <Money amount={u.amount} size={13} />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
};

Object.assign(window, { BudgetScreen, ShoppingScreen, SharedScreen, SmsReview, CategoriesScreen, PlannedScreen, Ring });
