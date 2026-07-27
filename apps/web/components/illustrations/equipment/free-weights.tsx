import * as React from 'react';
import type { EquipmentGlyph } from './types';

/**
 * Free-weights group (§4.2): barbell, ez-curl-bar, dumbbell, kettlebell, weight-plates.
 * Each glyph draws only the inner shapes on a 0 0 48 48 canvas; the wrapper supplies
 * `<svg>`, sizing and the currentColor/accent color context. One gold ★ element each.
 */

const ACCENT = 'var(--accent)';

/** shared 3px ground shadow line */
const Ground = () => (
  <line x1="10" y1="43" x2="38" y2="43" strokeWidth={3} className="ff-ground opacity-30" />
);

export const BarbellGlyph: EquipmentGlyph = () => (
  <>
    {/* bar */}
    <line x1="7" y1="24" x2="41" y2="24" strokeWidth={2.5} />
    {/* knurl ticks */}
    <line x1="22" y1="21.5" x2="22" y2="26.5" strokeWidth={1.3} />
    <line x1="24" y1="21.5" x2="24" y2="26.5" strokeWidth={1.3} />
    <line x1="26" y1="21.5" x2="26" y2="26.5" strokeWidth={1.3} />
    {/* left plates: outer, inner ★ */}
    <rect x="8" y="14" width="4.5" height="20" rx="1.4" />
    <rect x="13.5" y="17.5" width="3.2" height="13" rx="1.2" stroke={ACCENT} />
    {/* right plates: inner ★, outer */}
    <rect x="31.3" y="17.5" width="3.2" height="13" rx="1.2" stroke={ACCENT} />
    <rect x="35.5" y="14" width="4.5" height="20" rx="1.4" />
    <Ground />
  </>
);

export const EzCurlBarGlyph: EquipmentGlyph = () => (
  <>
    {/* straight ends */}
    <line x1="7" y1="24" x2="16" y2="24" strokeWidth={2.5} />
    <line x1="32" y1="24" x2="41" y2="24" strokeWidth={2.5} />
    {/* W-zigzag center ★ */}
    <path d="M16 24 L20 18 L24 30 L28 18 L32 24" strokeWidth={2.5} stroke={ACCENT} />
    {/* small plate pair */}
    <rect x="8" y="18.5" width="3.4" height="11" rx="1.2" />
    <rect x="36.6" y="18.5" width="3.4" height="11" rx="1.2" />
    <Ground />
  </>
);

export const DumbbellGlyph: EquipmentGlyph = () => (
  <>
    {/* left head slabs */}
    <rect x="8.5" y="15" width="4" height="18" rx="1.6" />
    <rect x="13.5" y="18" width="3" height="12" rx="1.4" />
    {/* right head slabs */}
    <rect x="31.5" y="18" width="3" height="12" rx="1.4" />
    <rect x="35.5" y="15" width="4" height="18" rx="1.6" />
    {/* handle ★ */}
    <line x1="16.5" y1="24" x2="31.5" y2="24" strokeWidth={2.5} stroke={ACCENT} />
    <Ground />
  </>
);

export const KettlebellGlyph: EquipmentGlyph = () => (
  <>
    {/* loop handle ★ (the window) */}
    <path d="M18 19 C18 12 30 12 30 19" strokeWidth={2.2} stroke={ACCENT} />
    {/* bell body */}
    <path d="M17.5 19 C13.5 22 12.5 30 16.5 35 L31.5 35 C35.5 30 34.5 22 30.5 19 Z" strokeWidth={2.2} />
    {/* flat base */}
    <line x1="16" y1="37" x2="32" y2="37" strokeWidth={2.5} />
    <Ground />
  </>
);

export const WeightPlatesGlyph: EquipmentGlyph = () => (
  <>
    {/* leaning discs, descending size; smallest ★ */}
    <circle cx="15" cy="26" r="9" />
    <circle cx="15" cy="26" r="2.4" />
    <circle cx="26" cy="27" r="7.4" />
    <circle cx="26" cy="27" r="2" />
    <circle cx="36" cy="28" r="6" stroke={ACCENT} />
    <circle cx="36" cy="28" r="1.6" stroke={ACCENT} />
    <Ground />
  </>
);
