import * as React from 'react';
import type { EquipmentGlyph } from './types';

/**
 * Bodyweight & accessories group (§4.2, 6 items): pull-up-bar, dip-station,
 * resistance-bands, suspension-trainer, ab-wheel, medicine-ball.
 *
 * Also hosts the single 'other'-category item (plyo-box). It lives here rather than in
 * machines.tsx because it has no stack, no bar and no seat — visually it belongs to the
 * light-kit language of this file, not the heavy-machine one.
 */

const ACCENT = 'var(--accent)';
const Ground = () => (
  <line x1="10" y1="43" x2="38" y2="43" strokeWidth={3} className="ff-ground opacity-30" />
);

export const PullUpBarGlyph: EquipmentGlyph = () => (
  <>
    {/* wall brackets */}
    <line x1="8" y1="12" x2="12" y2="12" />
    <line x1="36" y1="12" x2="40" y2="12" />
    <path d="M10 12 L10 18" />
    <path d="M38 12 L38 18" />
    {/* bar ★ */}
    <line x1="10" y1="18" x2="38" y2="18" strokeWidth={2.6} stroke={ACCENT} />
    {/* grip marks */}
    <line x1="18" y1="15.5" x2="18" y2="20.5" />
    <line x1="30" y1="15.5" x2="30" y2="20.5" />
  </>
);

export const DipStationGlyph: EquipmentGlyph = () => (
  <>
    {/* parallel handles ★ */}
    <line x1="9" y1="18" x2="22" y2="18" strokeWidth={2.6} stroke={ACCENT} />
    <line x1="26" y1="18" x2="39" y2="18" strokeWidth={2.6} stroke={ACCENT} />
    {/* splayed posts */}
    <path d="M12 18 L9 40" />
    <path d="M20 18 L23 40" />
    <path d="M28 18 L25 40" />
    <path d="M36 18 L39 40" />
    <Ground />
  </>
);

export const ResistanceBandsGlyph: EquipmentGlyph = () => (
  <>
    {/* large loop band */}
    <ellipse cx="19" cy="24" rx="11" ry="7" />
    <ellipse cx="19" cy="24" rx="7.5" ry="4.2" />
    {/* mini band ★ overlapping */}
    <ellipse cx="33" cy="30" rx="6" ry="4" stroke={ACCENT} strokeWidth={2.2} />
    <ellipse cx="33" cy="30" rx="3.4" ry="2" stroke={ACCENT} />
  </>
);

export const SuspensionTrainerGlyph: EquipmentGlyph = () => (
  <>
    {/* anchor */}
    <line x1="19" y1="9" x2="29" y2="9" strokeWidth={2.5} />
    <circle cx="24" cy="11" r="1.6" />
    {/* strap forking */}
    <path d="M24 12 L24 20 L15 32" />
    <path d="M24 20 L33 32" />
    {/* handles ★ */}
    <circle cx="14" cy="34" r="2.6" stroke={ACCENT} strokeWidth={2.2} />
    <circle cx="34" cy="34" r="2.6" stroke={ACCENT} strokeWidth={2.2} />
    {/* foot cradles */}
    <path d="M12 37 L16 37" />
    <path d="M32 37 L36 37" />
  </>
);

export const AbWheelGlyph: EquipmentGlyph = () => (
  <>
    {/* tire ring ★ */}
    <circle cx="24" cy="26" r="10" stroke={ACCENT} strokeWidth={2.6} />
    {/* hub */}
    <circle cx="24" cy="26" r="3.4" />
    {/* through-axle handles */}
    <line x1="8" y1="26" x2="14" y2="26" strokeWidth={2.5} />
    <line x1="34" y1="26" x2="40" y2="26" strokeWidth={2.5} />
    <line x1="8" y1="23" x2="8" y2="29" />
    <line x1="40" y1="23" x2="40" y2="29" />
  </>
);

export const MedicineBallGlyph: EquipmentGlyph = () => (
  <>
    {/* sphere */}
    <circle cx="24" cy="26" r="12" />
    {/* seams ★ */}
    <path d="M13 22 C20 25 28 25 35 22" stroke={ACCENT} strokeWidth={2.2} />
    <path d="M13 30 C20 27 28 27 35 30" stroke={ACCENT} strokeWidth={2.2} />
    {/* surface stipple */}
    <circle cx="20" cy="23" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="28" cy="30" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="24" cy="26" r="0.8" fill="currentColor" stroke="none" />
  </>
);

export const PlyoBoxGlyph: EquipmentGlyph = () => (
  <>
    {/* box front face — drawn in isometric so a novice reads "solid thing you jump onto",
        not "flat square". The jump-height cue matters more than the outline. */}
    <path d="M13 24 L13 40 L31 40 L31 24 Z" />
    {/* top face ★ — the landing surface is the whole point of the object */}
    <path d="M13 24 L20 19 L38 19 L31 24 Z" stroke={ACCENT} strokeWidth={2.4} />
    {/* side face */}
    <path d="M31 24 L38 19 L38 35 L31 40" />
    {/* soft-edge seam */}
    <line x1="13" y1="32" x2="31" y2="32" className="opacity-40" />
    <Ground />
  </>
);
