// ui.jsx — shared primitives, chrome (top bar, bottom nav), sheets
const { useState, useEffect, useRef } = React;

// Category icon chip
function CatChip({ cat, size = 38, r = 12 }) {
  const c = CATS[cat] || CATS.shopping;
  return (
    <div style={{
      width: size, height: size, borderRadius: r, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: c.color + '22', color: c.color,
      border: '1px solid ' + c.color + '33',
    }}>
      <Icon name={c.icon} size={size * 0.5} sw={2} />
    </div>
  );
}

function Avatar({ initials, tint = '#22C55E', size = 38, img }) {
  if (img) return <img src={img} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: tint + '26', color: tint, fontWeight: 600, fontSize: size * 0.36,
      border: '1px solid ' + tint + '44',
    }}>{initials}</div>
  );
}

function Money({ amount, size = 14, weight = 600, showSign = true, muteRwf = true }) {
  const pos = amount >= 0;
  const color = showSign ? (pos ? 'var(--income)' : 'var(--expense)') : 'inherit';
  return (
    <span className="tabnum" style={{ fontWeight: weight, fontSize: size, color, whiteSpace: 'nowrap' }}>
      {showSign ? signed(amount) : fmt(amount)}
      <span style={{ fontSize: size * 0.66, color: muteRwf ? 'var(--text-3)' : color, marginLeft: 3, fontWeight: 500 }}>RWF</span>
    </span>
  );
}

function Card({ children, style, pad = 16, onClick, className = '' }) {
  return (
    <div onClick={onClick} className={(onClick ? 'press ' : '') + className} style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--r)', padding: pad, ...style,
    }}>{children}</div>
  );
}

function Progress({ value, max, color = 'var(--accent)', h = 7, bg = 'rgba(255,255,255,0.08)' }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const over = value > max;
  return (
    <div style={{ height: h, borderRadius: h, background: bg, overflow: 'hidden' }}>
      <div style={{
        width: pct + '%', height: '100%', borderRadius: h,
        background: over ? 'var(--expense)' : color,
        transition: 'width .6s cubic-bezier(.2,.7,.3,1)',
      }} />
    </div>
  );
}

function Pill({ children, color = 'var(--text-2)', bg = 'rgba(255,255,255,0.06)', icon, size = 11 }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 99, background: bg, color,
      fontSize: size, fontWeight: 600, lineHeight: 1.4,
    }}>
      {icon && <Icon name={icon} size={size + 2} sw={2.2} />}
      {children}
    </span>
  );
}

// Confidence badge for AI tagging
function Conf({ value }) {
  const pct = Math.round(value * 100);
  const high = value >= 0.92, mid = value >= 0.8;
  const color = high ? 'var(--accent)' : mid ? 'var(--warn)' : 'var(--expense)';
  return <Pill color={color} bg={color + '1f'} icon="sparkles" size={10}>{pct}%</Pill>;
}

// Section header
function SectionHeader({ title, action, onAction }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0 0 10px' }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, letterSpacing: 0.2 }}>{title}</h3>
      {action && (
        <button onClick={onAction} className="press" style={{
          background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12,
          fontWeight: 600, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 2, padding: 0,
        }}>{action}<Icon name="chevronRight" size={14} sw={2.4} /></button>
      )}
    </div>
  );
}

// Sub-screen header with back
function ScreenHeader({ title, sub, onBack, right }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px 12px',
      position: 'sticky', top: 0, zIndex: 5,
      background: 'linear-gradient(var(--bg), rgba(10,13,16,0.86))',
      backdropFilter: 'blur(8px)', borderBottom: '1px solid var(--border)',
    }}>
      <button onClick={onBack} className="press" style={{
        width: 38, height: 38, borderRadius: 12, flexShrink: 0,
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)',
      }}><Icon name="arrowLeft" size={19} /></button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2 }}>{title}</div>
        {sub && <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 1 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

// Bottom sheet
function Sheet({ open, onClose, children, title }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end',
      background: 'rgba(0,0,0,0.55)', animation: 'fadeIn .2s ease',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', background: 'var(--surface)', borderTopLeftRadius: 24, borderTopRightRadius: 24,
        borderTop: '1px solid var(--border-2)', padding: '10px 16px calc(16px + env(safe-area-inset-bottom))',
        animation: 'sheetIn .32s cubic-bezier(.2,.8,.2,1)', maxHeight: '86%', overflowY: 'auto',
      }}>
        <div style={{ width: 40, height: 4, borderRadius: 4, background: 'var(--border-2)', margin: '4px auto 14px' }} />
        {title && <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>{title}</div>}
        {children}
      </div>
    </div>
  );
}

// Primary / secondary buttons
function Btn({ children, onClick, variant = 'primary', icon, full, size = 'md', style }) {
  const pads = size === 'lg' ? '15px 20px' : size === 'sm' ? '8px 12px' : '12px 16px';
  const fs = size === 'lg' ? 15 : size === 'sm' ? 12.5 : 14;
  const variants = {
    primary: { background: 'var(--accent)', color: 'var(--accent-ink)', border: '1px solid transparent', fontWeight: 700 },
    ghost: { background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)', fontWeight: 600 },
    soft: { background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid transparent', fontWeight: 600 },
    danger: { background: 'rgba(251,113,133,0.14)', color: 'var(--expense)', border: '1px solid transparent', fontWeight: 600 },
  };
  return (
    <button onClick={onClick} className="press" style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      padding: pads, borderRadius: 13, fontSize: fs, fontFamily: 'inherit', cursor: 'pointer',
      width: full ? '100%' : 'auto', ...variants[variant], ...style,
    }}>
      {icon && <Icon name={icon} size={fs + 4} sw={2.2} />}
      {children}
    </button>
  );
}

// ── Top bar (home greeting) ──────────────────────────────────
function TopBar({ onBell, onProfile, notif = 2 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px 6px' }}>
      <div style={{
        width: 30, height: 30, borderRadius: 9, background: 'var(--accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-ink)',
      }}><Icon name="sparkles" size={17} sw={2.4} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1 }}>Murakaza neza</div>
        <div style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.25 }}>Hello Fabrice</div>
      </div>
      <button onClick={onBell} className="press" style={{
        width: 38, height: 38, borderRadius: 12, position: 'relative',
        background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name="bell" size={19} />
        {notif > 0 && <span style={{
          position: 'absolute', top: 7, right: 8, width: 7, height: 7, borderRadius: 9,
          background: 'var(--expense)', border: '2px solid var(--surface-2)',
        }} />}
      </button>
      <button onClick={onProfile} className="press" style={{ padding: 0, border: 'none', background: 'none' }}>
        <Avatar initials="F" tint="#22C55E" size={38} />
      </button>
    </div>
  );
}

// ── Bottom navigation with center AI button ──────────────────
const NAV = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'accounts', label: 'Accounts', icon: 'wallet' },
  { id: 'ai', label: 'AI', icon: 'sparkles', center: true },
  { id: 'records', label: 'Records', icon: 'receipt' },
  { id: 'budget', label: 'Budget', icon: 'pie' },
];
function BottomNav({ active, go }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-around',
      padding: '8px 8px calc(8px + env(safe-area-inset-bottom))',
      background: 'rgba(13,17,21,0.92)', backdropFilter: 'blur(14px)',
      borderTop: '1px solid var(--border)', position: 'relative', zIndex: 10,
    }}>
      {NAV.map((n) => {
        if (n.center) {
          return (
            <button key={n.id} onClick={() => go('ai')} className="press" style={{
              width: 52, height: 52, borderRadius: 18, marginTop: -22, flexShrink: 0,
              background: 'linear-gradient(160deg, #34D399, #16A34A)', color: 'var(--accent-ink)',
              border: '3px solid var(--bg)', boxShadow: '0 8px 22px rgba(34,197,94,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><Icon name="sparkles" size={24} sw={2.2} /></button>
          );
        }
        const on = active === n.id;
        return (
          <button key={n.id} onClick={() => go(n.id)} className="press" style={{
            background: 'none', border: 'none', flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 3, padding: '4px 0', color: on ? 'var(--accent)' : 'var(--text-3)',
            cursor: 'pointer',
          }}>
            <Icon name={n.icon} size={21} sw={on ? 2.4 : 1.9} fill={on ? 'currentColor' : 'none'} />
            <span style={{ fontSize: 10, fontWeight: on ? 600 : 500, fontFamily: 'inherit' }}>{n.label}</span>
          </button>
        );
      })}
    </div>
  );
}

Object.assign(window, {
  CatChip, Avatar, Money, Card, Progress, Pill, Conf, SectionHeader,
  ScreenHeader, Sheet, Btn, TopBar, BottomNav,
});
