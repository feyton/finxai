// screens-chat.jsx — AI finance coach (friendly, informed, nudger)
const { useState: useStateC, useRef: useRefC, useEffect: useEffectC } = React;

// tiny markdown: **bold** and *italic*
function rich(text) {
  const parts = [];
  let key = 0;
  text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).forEach((seg) => {
    if (/^\*\*[^*]+\*\*$/.test(seg)) parts.push(<b key={key++}>{seg.slice(2, -2)}</b>);
    else if (/^\*[^*]+\*$/.test(seg)) parts.push(<i key={key++} style={{ color: 'var(--text-2)' }}>{seg.slice(1, -1)}</i>);
    else if (seg) parts.push(<span key={key++}>{seg}</span>);
  });
  return parts;
}

// canned, data-aware replies
function aiReply(q) {
  const s = q.toLowerCase();
  if (s.includes('week') || s.includes('go')) return {
    text: "Here's where your money went this week — **94,300 RWF** out across 9 transactions:",
    bars: [
      { cat: 'groceries', v: 40400 }, { cat: 'food', v: 28600 },
      { cat: 'transport', v: 4800 }, { cat: 'utilities', v: 10000 }, { cat: 'airtime', v: 2000 },
    ],
    foot: "Groceries led the way 🛒 — still **healthy**, you're under budget there.",
  };
  if (s.includes('transport')) return {
    text: "On **Transport** this month you've spent **22,600 RWF** of your 50,000 budget — moto rides + 1 YEGO cab.",
    bars: [{ cat: 'transport', v: 22600 }],
    foot: "You're at 45% with 1 day left. Comfortably green ✅",
  };
  if (s.includes('save') || s.includes('200')) return {
    text: "Let's check. After rent (250k) and your usual spend, you'd have about **310,000 RWF** of buffer this month.",
    foot: "Moving **200,000** to Savings is doable — you'd still keep ~110k cushion. Want me to schedule it for payday?",
    action: 'Schedule 200,000 → Savings',
  };
  if (s.includes('subscription') || s.includes('forgot')) return {
    text: "I found **2 recurring** charges:",
    list: ['Canal+ Rwanda — 18,000 / month', 'MTN 5GB bundle — 2,000 / week (≈8,000/mo)'],
    foot: "Canal+ renews in 4 days. Pause it and you'd save 18,000 this month 💡",
    action: 'Manage subscriptions',
  };
  return {
    text: "Good question! Based on your accounts you're sitting at **928,000 RWF** total. You're on track this month except *Entertainment* (107%).",
    foot: "Want a breakdown by category, or tips to free up cash?",
  };
}

function InsightBars({ bars }) {
  const max = Math.max(...bars.map(b => b.v));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
      {bars.map((b) => {
        const c = CATS[b.cat];
        return (
          <div key={b.cat} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 74, fontSize: 11, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</div>
            <div style={{ flex: 1, height: 8, borderRadius: 8, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ width: (b.v / max * 100) + '%', height: '100%', background: c.color, borderRadius: 8 }} />
            </div>
            <div className="tabnum" style={{ width: 50, textAlign: 'right', fontSize: 11, fontWeight: 600 }}>{fmt(b.v)}</div>
          </div>
        );
      })}
    </div>
  );
}

const ChatScreen = ({ go }) => {
  const [msgs, setMsgs] = useStateC(CHAT_SEED.map((m, i) => ({ ...m, id: 'seed' + i })));
  const [typing, setTyping] = useStateC(false);
  const [input, setInput] = useStateC('');
  const scrollRef = useRefC(null);

  useEffectC(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, typing]);

  const send = (text) => {
    const q = (text || input).trim();
    if (!q) return;
    setInput('');
    setMsgs((m) => [...m, { who: 'me', text: q, id: 'u' + Date.now() }]);
    setTyping(true);
    setTimeout(() => {
      const r = aiReply(q);
      setTyping(false);
      setMsgs((m) => [...m, { who: 'ai', ...r, id: 'a' + Date.now() }]);
    }, 1100);
  };

  return (
    <div className="app" style={{ background: 'var(--bg)' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => go('home')} className="press" style={{
          width: 36, height: 36, borderRadius: 11, background: 'var(--surface-2)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)',
        }}><Icon name="arrowLeft" size={18} /></button>
        <div style={{
          width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(160deg,#34D399,#16A34A)',
          color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon name="sparkles" size={21} sw={2.2} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>Finance Coach</div>
          <div style={{ fontSize: 11, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: 6, background: 'var(--accent)' }} /> Knows your accounts
          </div>
        </div>
        <button className="press" style={{
          width: 36, height: 36, borderRadius: 11, background: 'var(--surface-2)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)',
        }}><Icon name="clock" size={18} /></button>
      </div>

      {/* thread */}
      <div ref={scrollRef} className="scroll" style={{ padding: '16px 14px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {msgs.map((m) => <Bubble key={m.id} m={m} />)}
        {typing && (
          <div style={{ display: 'flex', gap: 4, padding: '12px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, borderTopLeftRadius: 5, alignSelf: 'flex-start' }}>
            {[0, 1, 2].map(i => <span key={i} style={{ width: 7, height: 7, borderRadius: 7, background: 'var(--text-3)', animation: `dot 1.2s ${i * 0.15}s infinite` }} />)}
          </div>
        )}
      </div>

      {/* suggestions */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '6px 14px 10px', scrollbarWidth: 'none' }}>
        {CHAT_SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => send(s)} className="press" style={{
            flexShrink: 0, padding: '8px 13px', borderRadius: 99, background: 'var(--surface-2)',
            border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 12, fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}>{s}</button>
        ))}
      </div>

      {/* input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 14px calc(12px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--border)' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px 4px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 22 }}>
          <input value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Ask about your money…"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 13.5, fontFamily: 'inherit' }} />
          <button className="press" style={{ width: 34, height: 34, borderRadius: 99, background: 'none', border: 'none', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="mic" size={19} />
          </button>
        </div>
        <button onClick={() => send()} className="press" style={{
          width: 44, height: 44, borderRadius: 99, background: 'var(--accent)', color: 'var(--accent-ink)',
          border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}><Icon name="send" size={20} sw={2.2} /></button>
      </div>
    </div>
  );
};

const Bubble = ({ m }) => {
  if (m.who === 'me') return (
    <div style={{ alignSelf: 'flex-end', maxWidth: '82%', background: 'var(--accent)', color: 'var(--accent-ink)', padding: '10px 14px', borderRadius: 16, borderBottomRightRadius: 5, fontSize: 13.5, fontWeight: 500, lineHeight: 1.45 }}>
      {m.text}
    </div>
  );
  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '88%', display: 'flex', flexDirection: 'column', gap: 8, animation: 'popIn .3s ease' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '11px 14px', borderRadius: 16, borderTopLeftRadius: 5, fontSize: 13.5, lineHeight: 1.5 }}>
        <div>{rich(m.text)}</div>
        {m.bars && <InsightBars bars={m.bars} />}
        {m.list && (
          <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {m.list.map((x, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                <Icon name="repeat" size={15} color="var(--accent)" /> {x}
              </div>
            ))}
          </div>
        )}
        {m.foot && <div style={{ marginTop: 9, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{rich(m.foot)}</div>}
        {m.kind === 'insight' && (
          <div style={{ marginTop: 9, height: 7, borderRadius: 7, background: 'rgba(251,113,133,0.18)', overflow: 'hidden' }}>
            <div style={{ width: '100%', height: '100%', background: 'var(--expense)' }} />
          </div>
        )}
      </div>
      {m.action && (
        <button className="press" style={{
          alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 14px',
          borderRadius: 12, background: 'var(--accent-soft)', border: '1px solid rgba(34,197,94,0.25)',
          color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
        }}><Icon name="check" size={15} sw={2.4} />{m.action}</button>
      )}
    </div>
  );
};

Object.assign(window, { ChatScreen });
