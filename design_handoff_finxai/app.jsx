// app.jsx — router, device frame, tweaks, small screens
const { useState: useStateA, useEffect: useEffectA, useRef: useRefA } = React;

// ── small screens ────────────────────────────────────────────
const NotificationsScreen = ({ go }) => {
  const items = [
    { icon: 'sparkles', tint: '#22C55E', t: 'AI sorted 11 new transactions', s: 'From MoMo & BK SMS · 2 min ago', unread: true },
    { icon: 'alert', tint: '#FB7185', t: 'Entertainment budget exceeded', s: 'Canal+ pushed you to 107% · 1 hr ago', unread: true },
    { icon: 'users', tint: '#60A5FA', t: 'Aline added an expense', s: 'Kimironko Market · 12,000 RWF · 3 hr ago', unread: false },
    { icon: 'calendar', tint: '#FBBF24', t: 'Rent due tomorrow', s: '250,000 RWF · Bank of Kigali', unread: false },
    { icon: 'coins', tint: '#22C55E', t: 'Salary received', s: '620,000 RWF · yesterday', unread: false },
  ];
  return (
    <div className="screen-in" style={{ paddingBottom: 24 }}>
      <ScreenHeader title="Notifications" onBack={() => go('home')} right={<button className="press" style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>Mark all</button>} />
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((n, i) => (
          <Card key={i} pad={13} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: n.unread ? 'var(--surface)' : 'transparent', borderColor: n.unread ? 'var(--border)' : 'transparent' }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: n.tint + '22', color: n.tint, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={n.icon} size={20} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{n.t}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 1 }}>{n.s}</div>
            </div>
            {n.unread && <span style={{ width: 8, height: 8, borderRadius: 8, background: 'var(--accent)', marginTop: 5 }} />}
          </Card>
        ))}
      </div>
    </div>
  );
};

const ProfileScreen = ({ go }) => {
  const rows = [
    { icon: 'message', t: 'SMS auto-import', s: 'MoMo, BK, Equity connected', go: 'sms' },
    { icon: 'tag', t: 'Categories', s: '13 active', go: 'categories' },
    { icon: 'users', t: 'Shared & family', s: '2 people', go: 'shared' },
    { icon: 'calendarPlus', t: 'Schedule & recurring', s: '5 upcoming', go: 'schedule' },
    { icon: 'coins', t: 'Debts & loans', s: '3 active', go: 'debt' },
    { icon: 'shield', t: 'Privacy & security', s: 'On-device encryption', go: null },
    { icon: 'globe', t: 'Currency & region', s: 'RWF · Rwanda', go: null },
  ];
  return (
    <div className="screen-in" style={{ paddingBottom: 24 }}>
      <ScreenHeader title="Profile" onBack={() => go('home')} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '4px 4px 8px' }}>
          <Avatar initials="F" tint="#22C55E" size={60} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Fabrice</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Kigali · joined Mar 2026</div>
            <div style={{ marginTop: 6 }}><Pill icon="star" color="var(--warn)" bg="rgba(251,191,36,0.16)">Premium</Pill></div>
          </div>
        </div>
        <Card pad={4}>
          {rows.map((r, i) => (
            <div key={i} onClick={() => r.go && go(r.go)} className={r.go ? 'press' : ''} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 11px', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--surface-2)', color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={r.icon} size={18} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{r.t}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{r.s}</div>
              </div>
              <Icon name="chevronRight" size={17} color="var(--text-3)" />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
};

const AddTxnScreen = ({ go }) => {
  const [amt, setAmt] = useStateA('');
  const [cat, setCat] = useStateA('food');
  return (
    <div className="screen-in">
      <ScreenHeader title="Add transaction" onBack={() => go('home')} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ textAlign: 'center', padding: '14px 0' }}>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>Amount</div>
          <div className="tabnum" style={{ fontSize: 38, fontWeight: 700 }}>{amt || '0'}<span style={{ fontSize: 16, color: 'var(--text-3)', marginLeft: 6 }}>RWF</span></div>
        </div>
        <div style={{ padding: 13, borderRadius: 'var(--r)', background: 'var(--accent-soft)', border: '1px solid rgba(34,197,94,0.22)', display: 'flex', gap: 10, alignItems: 'center' }}>
          <Icon name="sparkles" size={18} color="var(--accent)" />
          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Tip: most expenses appear automatically from SMS — you rarely need this.</div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Category</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            {Object.values(CATS).slice(0, 8).map(c => (
              <button key={c.id} onClick={() => setCat(c.id)} className="press" style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '6px 0', opacity: cat === c.id ? 1 : 0.55 }}>
                <div style={{ width: 42, height: 42, borderRadius: 13, background: c.color + '22', color: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', border: cat === c.id ? '2px solid ' + c.color : '2px solid transparent' }}><Icon name={c.icon} size={21} /></div>
                <span style={{ fontSize: 9.5, color: 'var(--text-2)' }}>{c.label.split(' ')[0]}</span>
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          {['1','2','3','4','5','6','7','8','9','000','0','⌫'].map(k => (
            <button key={k} onClick={() => setAmt(a => k === '⌫' ? a.slice(0, -1) : (a + k))} className="press" style={{ padding: '14px 0', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 18, fontWeight: 600, fontFamily: 'inherit' }}>{k}</button>
          ))}
        </div>
        <Btn variant="primary" full size="lg" icon="check" onClick={() => go('home')}>Save transaction</Btn>
      </div>
    </div>
  );
};

// ── routing ──────────────────────────────────────────────────
const ROOTS = ['home', 'accounts', 'records', 'budget', 'ai'];
const SCREENS = {
  home: HomeScreen, accounts: AccountsScreen, records: RecordsScreen, budget: BudgetsHub,
  account: AccountDetail, 'add-account': AddAccount, txn: TxnDetail, sms: SmsReview,
  categories: CategoriesScreen, shopping: ShoppingScreen, shared: SharedScreen,
  planned: PlannedScreen, schedule: ScheduleScreen, notifications: NotificationsScreen,
  profile: ProfileScreen, 'add-txn': AddTxnScreen, 'share-account': SharedScreen,
  debt: DebtScreen, 'debt-detail': DebtDetail, 'add-debt': AddDebt,
  'budget-group': BudgetGroupDetail, 'create-budget': CreateBudget,
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#22C55E",
  "radius": "rounded",
  "glow": true
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [tab, setTab] = useStateA('home');
  const [stack, setStack] = useStateA([{ name: 'home', params: {} }]);
  const cur = stack[stack.length - 1];

  const go = (name, params = {}) => {
    if (name === 'home') { setTab('home'); setStack([{ name: 'home', params: {} }]); return; }
    if (ROOTS.includes(name)) { setTab(name); setStack([{ name, params }]); return; }
    setStack(s => [...s, { name, params }]);
  };

  // apply theme tweaks
  useEffectA(() => {
    const r = document.documentElement.style;
    r.setProperty('--accent', t.accent);
    r.setProperty('--accent-600', `color-mix(in srgb, ${t.accent} 82%, #000)`);
    r.setProperty('--accent-soft', `color-mix(in srgb, ${t.accent} 15%, transparent)`);
    r.setProperty('--accent-ink', `color-mix(in srgb, ${t.accent} 26%, #04110a)`);
    if (t.radius === 'sharp') { r.setProperty('--r', '9px'); r.setProperty('--r-lg', '13px'); r.setProperty('--r-sm', '7px'); }
    else { r.setProperty('--r', '16px'); r.setProperty('--r-lg', '22px'); r.setProperty('--r-sm', '10px'); }
  }, [t.accent, t.radius]);

  const Screen = SCREENS[cur.name] || HomeScreen;
  const isChat = cur.name === 'ai';

  return (
    <FitDevice glow={t.glow}>
      <AndroidDevice dark>
        {isChat ? (
          <ChatScreen go={go} />
        ) : (
          <div className="app">
            <div className="scroll" key={cur.name + JSON.stringify(cur.params)}>
              <Screen go={go} params={cur.params} />
            </div>
            <BottomNav active={tab} go={go} />
          </div>
        )}
      </AndroidDevice>

      <TweaksPanel>
        <TweakSection label="Accent" />
        <TweakColor label="Color" value={t.accent}
          options={['#22C55E', '#2A8CF0', '#7C5CFC', '#14B8A6', '#F59E0B']}
          onChange={(v) => setTweak('accent', v)} />
        <TweakSection label="Style" />
        <TweakRadio label="Corners" value={t.radius} options={['rounded', 'sharp']} onChange={(v) => setTweak('radius', v)} />
        <TweakToggle label="Ambient glow" value={t.glow} onChange={(v) => setTweak('glow', v)} />
      </TweaksPanel>
    </FitDevice>
  );
}

// fit the fixed device into any viewport
function FitDevice({ children, glow }) {
  const [scale, setScale] = useStateA(1);
  useEffectA(() => {
    const fit = () => {
      const vw = window.innerWidth, vh = window.innerHeight;
      setScale(Math.min(1, (vw - 24) / 412, (vh - 24) / 892));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div className="stage" style={{ background: glow
      ? 'radial-gradient(900px 600px at 50% -10%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 60%), var(--stage)'
      : 'var(--stage)' }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'center', position: 'relative' }}>
        {children}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
