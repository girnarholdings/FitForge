import * as React from 'react';
import type { EquipmentGlyph } from './types';

/** Cables group (§4.2): cable-machine, lat-pulldown, seated-row-machine. */

const ACCENT = 'var(--accent)';
const Ground = () => (
  <line x1="10" y1="43" x2="38" y2="43" strokeWidth={3} className="ff-ground opacity-30" />
);

export const CableMachineGlyph: EquipmentGlyph = () => (
  <>
    {/* two towers */}
    <line x1="12" y1="9" x2="12" y2="40" />
    <line x1="36" y1="9" x2="36" y2="40" />
    {/* top beam */}
    <line x1="10" y1="10" x2="38" y2="10" />
    {/* pulleys */}
    <circle cx="12" cy="14" r="2" />
    <circle cx="36" cy="14" r="2" />
    {/* cables */}
    <line x1="12" y1="16" x2="12" y2="25" />
    <line x1="36" y1="16" x2="36" y2="25" />
    {/* D-handles ★ */}
    <path d="M9 25 L15 25 L14 29 L10 29 Z" stroke={ACCENT} strokeWidth={2.2} />
    <path d="M33 25 L39 25 L38 29 L34 29 Z" stroke={ACCENT} strokeWidth={2.2} />
    {/* base feet */}
    <line x1="9" y1="40" x2="15" y2="40" strokeWidth={2.5} />
    <line x1="33" y1="40" x2="39" y2="40" strokeWidth={2.5} />
  </>
);

export const LatPulldownGlyph: EquipmentGlyph = () => (
  <>
    {/* tower + top */}
    <line x1="31" y1="9" x2="31" y2="40" />
    <line x1="18" y1="10" x2="35" y2="10" />
    {/* cable to bar */}
    <line x1="20" y1="11" x2="20" y2="16" />
    {/* wide bar ★ (bent ends) */}
    <path d="M11 18 L11 16 L29 16 L29 18" strokeWidth={2.6} stroke={ACCENT} />
    {/* knee-pad roller */}
    <rect x="19" y="24" width="12" height="3.6" rx="1.8" />
    {/* seat */}
    <rect x="22" y="31" width="11" height="4" rx="1.5" />
    <line x1="25" y1="35" x2="25" y2="40" />
    <Ground />
  </>
);

export const SeatedRowMachineGlyph: EquipmentGlyph = () => (
  <>
    {/* chest pad */}
    <rect x="11" y="19" width="5" height="6" rx="1.5" />
    {/* seat */}
    <rect x="9" y="30" width="10" height="4" rx="1.5" />
    <line x1="13" y1="30" x2="13" y2="25" />
    {/* low cable along floor */}
    <line x1="17" y1="34" x2="33" y2="36" />
    {/* floor pulley */}
    <circle cx="35" cy="37" r="2" />
    {/* V-handle ★ */}
    <path d="M33 32 L38 36 L33 40" strokeWidth={2.4} stroke={ACCENT} />
    <Ground />
  </>
);
