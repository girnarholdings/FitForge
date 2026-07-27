import * as React from 'react';
import type { EquipmentGlyph } from './types';

/** Cardio group (§4.2): treadmill, stationary-bike, rowing-machine. */

const ACCENT = 'var(--accent)';
const Ground = () => (
  <line x1="10" y1="43" x2="38" y2="43" strokeWidth={3} className="ff-ground opacity-30" />
);

export const TreadmillGlyph: EquipmentGlyph = () => (
  <>
    {/* deck (slanted parallelogram) */}
    <path d="M9 36 L30 36 L34 30 L13 30 Z" />
    {/* belt ★ (top surface) */}
    <line x1="13" y1="30" x2="34" y2="30" strokeWidth={2.6} stroke={ACCENT} />
    {/* belt hatch marks */}
    <line x1="16" y1="33" x2="18" y2="33" />
    <line x1="20" y1="33" x2="22" y2="33" />
    <line x1="24" y1="33" x2="26" y2="33" />
    {/* console mast + panel */}
    <line x1="33" y1="30" x2="37" y2="16" />
    <rect x="33" y="11" width="9" height="5.5" rx="1.5" />
    {/* front wheel */}
    <circle cx="12" cy="38" r="1.6" />
  </>
);

export const StationaryBikeGlyph: EquipmentGlyph = () => (
  <>
    {/* flywheel ★ */}
    <circle cx="16" cy="30" r="7" stroke={ACCENT} strokeWidth={2.4} />
    <circle cx="16" cy="30" r="1.4" />
    {/* frame */}
    <path d="M16 30 L26 17" />
    <path d="M16 30 L29 33" />
    {/* seat post + saddle */}
    <line x1="26" y1="17" x2="26" y2="13" />
    <line x1="22" y1="12.5" x2="30" y2="12.5" strokeWidth={2.4} />
    {/* handlebars */}
    <line x1="29" y1="17" x2="31" y2="11" />
    <line x1="28" y1="11" x2="34" y2="11" strokeWidth={2.4} />
    {/* pedal/crank */}
    <line x1="16" y1="30" x2="18" y2="34" />
    <circle cx="18" cy="35" r="1.4" />
    <Ground />
  </>
);

export const RowingMachineGlyph: EquipmentGlyph = () => (
  <>
    {/* monorail */}
    <line x1="12" y1="34" x2="40" y2="34" strokeWidth={2.5} />
    {/* fan flywheel cage ★ */}
    <circle cx="15" cy="25" r="7" stroke={ACCENT} strokeWidth={2.4} />
    <path d="M15 18 L15 32 M8 25 L22 25" stroke={ACCENT} />
    {/* sliding seat */}
    <rect x="24" y="29" width="6" height="4" rx="1.5" />
    {/* handle + chain */}
    <line x1="22" y1="26" x2="27" y2="30" />
    <line x1="21" y1="24" x2="21" y2="28" strokeWidth={2.4} />
    {/* footrest */}
    <path d="M17 31 L20 34" />
    <Ground />
  </>
);
