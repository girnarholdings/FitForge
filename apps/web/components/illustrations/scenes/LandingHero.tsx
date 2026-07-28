import * as React from 'react';

/**
 * Landing composite scene (§4.3).
 *
 * A stylized "forged" front-body figure — built from armored slate plates with
 * the delts / pecs / quads struck gold — emerging from the ember-glow gradient,
 * orbited by three floating gold-hairline mini-cards (a logged set, a macro
 * ring, an equipment tile). Pure SVG/HTML, self-contained (no cross-workstream
 * import), one slow CSS float loop that honors `prefers-reduced-motion`.
 *
 * The figure here is decorative brand art; the real anatomical `MuscleMap`
 * (WS-C) is the product surface. Kept self-contained so the barrel + scenes
 * compile before the muscle-map paths land.
 */
export interface LandingHeroProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Max render width in px (height follows). */
  width?: number;
}

const CSS = `
.ff-hero { position: relative; width: 100%; margin-inline: auto; aspect-ratio: 5 / 6; }
.ff-hero__glow {
  position: absolute; inset: 0;
  background:
    radial-gradient(58% 42% at 50% 8%, rgba(228,184,77,0.18), transparent 68%),
    radial-gradient(40% 30% at 78% 70%, rgba(255,138,77,0.10), transparent 70%);
}
.ff-hero__figure { position: absolute; inset: 0; display: grid; place-items: center; }
.ff-hero__figure svg { height: 92%; width: auto; opacity: 0.95; }
.ff-hero__card {
  position: absolute;
  border: 1px solid transparent;
  border-radius: 14px;
  padding: 10px 12px;
  background:
    linear-gradient(var(--surface-2), var(--surface-2)) padding-box,
    linear-gradient(160deg, rgba(228,184,77,0.55), rgba(228,184,77,0.08) 70%) border-box;
  box-shadow: 0 10px 28px -14px rgba(0,0,0,0.8);
  font-family: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  color: var(--foreground);
  will-change: transform;
}
.ff-hero__card--set { top: 6%; right: 0%; animation: ffFloatA 6s ease-in-out infinite; }
.ff-hero__card--macro { top: 40%; left: -2%; animation: ffFloatB 7s ease-in-out infinite; }
.ff-hero__card--equip { bottom: 7%; right: 6%; animation: ffFloatA 6.5s ease-in-out infinite 0.4s; }
.ff-hero__stat {
  font-family: var(--font-space-grotesk), var(--font-inter), system-ui, sans-serif;
  font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1;
}
.ff-hero__label { color: var(--muted-foreground); font-size: 11px; letter-spacing: 0.04em; }
.ff-hero__check { color: var(--accent); }
@keyframes ffFloatA { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }
@keyframes ffFloatB { 0%,100% { transform: translateY(0); } 50% { transform: translateY(7px); } }
@media (prefers-reduced-motion: reduce) {
  .ff-hero__card { animation: none !important; }
}
`;

function Figure() {
  const base = 'var(--muscle-base)';
  const line = 'var(--muscle-line)';
  const outline = 'var(--body-outline)';
  const gold = 'var(--accent)';
  return (
    <svg viewBox="0 0 200 440" fill="none" aria-hidden="true">
      {/* head + neck */}
      <circle cx="100" cy="38" r="19" fill={base} stroke={outline} strokeWidth="1.5" />
      <rect x="91" y="53" width="18" height="22" rx="6" fill={base} stroke={outline} strokeWidth="1.5" />
      {/* traps collar */}
      <path d="M74 74 Q100 64 126 74 L120 84 Q100 78 80 84 Z" fill={base} stroke={line} strokeWidth="1" />
      {/* delts (gold) */}
      <ellipse cx="60" cy="98" rx="17" ry="15" fill={gold} fillOpacity="0.92" stroke={outline} strokeWidth="1.2" />
      <ellipse cx="140" cy="98" rx="17" ry="15" fill={gold} fillOpacity="0.92" stroke={outline} strokeWidth="1.2" />
      {/* pecs (gold) */}
      <path d="M76 86 Q100 84 100 84 L100 112 Q86 116 74 108 Q72 94 76 86 Z" fill={gold} fillOpacity="0.92" stroke={outline} strokeWidth="1.2" />
      <path d="M124 86 Q100 84 100 84 L100 112 Q114 116 126 108 Q128 94 124 86 Z" fill={gold} fillOpacity="0.92" stroke={outline} strokeWidth="1.2" />
      {/* upper arms */}
      <rect x="43" y="96" width="16" height="58" rx="8" fill={base} stroke={outline} strokeWidth="1.5" />
      <rect x="141" y="96" width="16" height="58" rx="8" fill={base} stroke={outline} strokeWidth="1.5" />
      {/* forearms */}
      <rect x="40" y="150" width="14" height="52" rx="7" fill={base} stroke={outline} strokeWidth="1.5" />
      <rect x="146" y="150" width="14" height="52" rx="7" fill={base} stroke={outline} strokeWidth="1.5" />
      {/* abs wall */}
      <rect x="86" y="114" width="28" height="52" rx="8" fill={base} stroke={outline} strokeWidth="1.5" />
      <path d="M100 118 L100 162 M88 130 L112 130 M88 144 L112 144" stroke={line} strokeWidth="1.2" />
      {/* obliques */}
      <path d="M74 112 Q80 138 84 160 L86 158 L86 114 Z" fill={base} stroke={line} strokeWidth="1" />
      <path d="M126 112 Q120 138 116 160 L114 158 L114 114 Z" fill={base} stroke={line} strokeWidth="1" />
      {/* pelvis */}
      <path d="M82 166 L118 166 L112 192 Q100 200 88 192 Z" fill={base} stroke={outline} strokeWidth="1.5" />
      {/* quads (gold) */}
      <rect x="80" y="196" width="18" height="80" rx="9" fill={gold} fillOpacity="0.92" stroke={outline} strokeWidth="1.2" />
      <rect x="102" y="196" width="18" height="80" rx="9" fill={gold} fillOpacity="0.92" stroke={outline} strokeWidth="1.2" />
      {/* knees */}
      <circle cx="89" cy="282" r="8" fill={base} stroke={outline} strokeWidth="1.3" />
      <circle cx="111" cy="282" r="8" fill={base} stroke={outline} strokeWidth="1.3" />
      {/* calves + shins */}
      <rect x="82" y="290" width="15" height="74" rx="7" fill={base} stroke={outline} strokeWidth="1.5" />
      <rect x="103" y="290" width="15" height="74" rx="7" fill={base} stroke={outline} strokeWidth="1.5" />
      {/* feet */}
      <path d="M82 366 Q80 378 92 378 L97 378 L97 366 Z" fill={base} stroke={outline} strokeWidth="1.3" />
      <path d="M118 366 Q120 378 108 378 L103 378 L103 366 Z" fill={base} stroke={outline} strokeWidth="1.3" />
    </svg>
  );
}

function MacroRing() {
  return (
    <svg width="34" height="34" viewBox="0 0 36 36" aria-hidden="true">
      <circle cx="18" cy="18" r="15" fill="none" stroke="var(--muted)" strokeWidth="4" />
      <circle
        cx="18"
        cy="18"
        r="15"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="72 94"
        transform="rotate(-90 18 18)"
      />
    </svg>
  );
}

export function LandingHero({ width = 360, style, className, ...props }: LandingHeroProps) {
  return (
    <div
      className={['ff-hero', className].filter(Boolean).join(' ')}
      style={{ maxWidth: width, ...style }}
      aria-hidden="true"
      {...props}
    >
      <style>{CSS}</style>
      <div className="ff-hero__glow" />
      <div className="ff-hero__figure">
        <Figure />
      </div>

      {/* logged set */}
      <div className="ff-hero__card ff-hero__card--set">
        <div className="ff-hero__label">SET 3</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span className="ff-hero__stat" style={{ fontSize: 22, color: 'var(--accent)' }}>
            100
          </span>
          <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>kg</span>
          <span style={{ fontSize: 13 }}>× 5</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="ff-hero__check">
            <path d="M4 12.5 L9.5 18 L20 6.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* macro ring */}
      <div
        className="ff-hero__card ff-hero__card--macro"
        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <MacroRing />
        <div>
          <div className="ff-hero__stat" style={{ fontSize: 16 }}>
            148g
          </div>
          <div className="ff-hero__label">protein</div>
        </div>
      </div>

      {/* equipment tile */}
      <div
        className="ff-hero__card ff-hero__card--equip"
        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10"
            stroke="var(--accent)"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Barbell</span>
      </div>
    </div>
  );
}

export default LandingHero;
