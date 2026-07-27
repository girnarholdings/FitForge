import * as React from 'react';
import type { EquipmentGlyph } from './types';

/** Benches & racks group (§4.2): flat-bench, adjustable-bench, squat-rack. */

const ACCENT = 'var(--accent)';
const Ground = () => (
  <line x1="10" y1="43" x2="38" y2="43" strokeWidth={3} className="ff-ground opacity-30" />
);

export const FlatBenchGlyph: EquipmentGlyph = () => (
  <>
    {/* pad ★ */}
    <rect x="8" y="20" width="32" height="5" rx="2.5" stroke={ACCENT} strokeWidth={2.2} />
    {/* splayed H-legs */}
    <path d="M13 25 L10 40" />
    <path d="M15 25 L18 40" />
    <path d="M33 25 L36 40" />
    <path d="M35 25 L32 40" />
    <Ground />
  </>
);

export const AdjustableBenchGlyph: EquipmentGlyph = () => (
  <>
    {/* inclined back pad ★ (~45°) */}
    <line x1="13" y1="27" x2="24" y2="15" strokeWidth={4.5} stroke={ACCENT} strokeLinecap="round" />
    {/* seat pad */}
    <rect x="23" y="26" width="13" height="4.5" rx="2" />
    {/* adjustment ladder notches */}
    <path d="M18 28 L18 34" />
    <path d="M18 30 L21 30" />
    <path d="M18 32 L21 32" />
    {/* legs */}
    <path d="M27 30.5 L27 40" />
    <path d="M34 30.5 L34 40" />
    <Ground />
  </>
);

export const SquatRackGlyph: EquipmentGlyph = () => (
  <>
    {/* uprights */}
    <line x1="13" y1="9" x2="13" y2="40" />
    <line x1="35" y1="9" x2="35" y2="40" />
    {/* top crossmember */}
    <line x1="11" y1="10" x2="37" y2="10" />
    {/* J-hooks ★ */}
    <path d="M13 22 L17.5 22 L17.5 25" stroke={ACCENT} strokeWidth={2.2} />
    <path d="M35 22 L30.5 22 L30.5 25" stroke={ACCENT} strokeWidth={2.2} />
    {/* safety pins */}
    <path d="M13 30 L18 30" />
    <path d="M35 30 L30 30" />
    {/* base feet */}
    <line x1="9" y1="40" x2="17" y2="40" strokeWidth={2.5} />
    <line x1="31" y1="40" x2="39" y2="40" strokeWidth={2.5} />
  </>
);
