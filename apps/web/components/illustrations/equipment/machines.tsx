import * as React from 'react';
import type { EquipmentGlyph } from './types';

/**
 * Machines group (§4.2, 10 items): smith-machine, leg-press, hack-squat-machine,
 * leg-extension-machine, leg-curl-machine, chest-press-machine, pec-deck,
 * shoulder-press-machine, hip-thrust-machine, calf-raise-machine.
 */

const ACCENT = 'var(--accent)';
const Ground = () => (
  <line x1="10" y1="43" x2="38" y2="43" strokeWidth={3} className="ff-ground opacity-30" />
);

export const SmithMachineGlyph: EquipmentGlyph = () => (
  <>
    {/* vertical guide rails */}
    <line x1="14" y1="9" x2="14" y2="40" />
    <line x1="34" y1="9" x2="34" y2="40" />
    {/* top beam */}
    <line x1="12" y1="10" x2="36" y2="10" />
    {/* locked bar ★ */}
    <line x1="12" y1="24" x2="36" y2="24" strokeWidth={2.5} stroke={ACCENT} />
    {/* plates on the bar */}
    <rect x="15" y="20" width="3" height="8" rx="1" />
    <rect x="30" y="20" width="3" height="8" rx="1" />
    {/* hook rotation dashes */}
    <line x1="14" y1="21" x2="16" y2="21" />
    <line x1="34" y1="21" x2="32" y2="21" />
    {/* base feet */}
    <line x1="10" y1="40" x2="18" y2="40" strokeWidth={2.5} />
    <line x1="30" y1="40" x2="38" y2="40" strokeWidth={2.5} />
  </>
);

export const LegPressGlyph: EquipmentGlyph = () => (
  <>
    {/* 45° sled rail */}
    <line x1="10" y1="39" x2="34" y2="14" strokeWidth={2.5} />
    {/* side rail parallel */}
    <line x1="13" y1="39" x2="36" y2="17" />
    {/* foot plate ★ */}
    <rect x="29" y="9" width="11" height="8" rx="1.5" stroke={ACCENT} strokeWidth={2.2} />
    {/* reclined seat */}
    <path d="M10 39 L9 31" />
    <line x1="9" y1="34" x2="16" y2="36" />
    <Ground />
  </>
);

export const HackSquatMachineGlyph: EquipmentGlyph = () => (
  <>
    {/* angled back board */}
    <line x1="13" y1="14" x2="33" y2="38" strokeWidth={2.5} />
    <line x1="16" y1="12" x2="36" y2="36" />
    {/* shoulder pads ★ */}
    <rect x="10" y="11" width="7" height="4" rx="2" stroke={ACCENT} strokeWidth={2.2} />
    <rect x="9" y="16" width="6" height="3.6" rx="1.8" stroke={ACCENT} strokeWidth={2.2} />
    {/* foot plate */}
    <line x1="30" y1="38" x2="40" y2="38" strokeWidth={2.5} />
    <Ground />
  </>
);

export const LegExtensionMachineGlyph: EquipmentGlyph = () => (
  <>
    {/* upright seat back */}
    <line x1="14" y1="12" x2="14" y2="28" />
    {/* seat pad */}
    <line x1="14" y1="28" x2="26" y2="28" strokeWidth={2.5} />
    {/* pivot arm to shin */}
    <line x1="26" y1="28" x2="31" y2="38" />
    {/* front lower roller ★ */}
    <circle cx="32" cy="36" r="3.6" stroke={ACCENT} strokeWidth={2.2} />
    <circle cx="27" cy="38" r="2.6" />
    {/* frame */}
    <line x1="14" y1="40" x2="22" y2="40" strokeWidth={2.5} />
    <Ground />
  </>
);

export const LegCurlMachineGlyph: EquipmentGlyph = () => (
  <>
    {/* flat bench pad */}
    <rect x="10" y="24" width="24" height="4.5" rx="2" />
    {/* legs */}
    <path d="M13 28.5 L11 40" />
    <path d="M31 28.5 L33 40" />
    {/* rear upper roller ★ at heel height */}
    <line x1="34" y1="26" x2="37" y2="18" />
    <circle cx="37" cy="17" r="3.6" stroke={ACCENT} strokeWidth={2.2} />
    <Ground />
  </>
);

export const ChestPressMachineGlyph: EquipmentGlyph = () => (
  <>
    {/* seat back + pad */}
    <line x1="12" y1="13" x2="12" y2="34" />
    <line x1="12" y1="34" x2="22" y2="34" strokeWidth={2.5} />
    {/* horizontal press arms */}
    <line x1="12" y1="20" x2="30" y2="20" />
    <line x1="12" y1="27" x2="30" y2="27" />
    {/* grips ★ */}
    <line x1="30" y1="16.5" x2="30" y2="23.5" strokeWidth={2.6} stroke={ACCENT} />
    <line x1="30" y1="23.5" x2="30" y2="30.5" strokeWidth={2.6} stroke={ACCENT} />
    <Ground />
  </>
);

export const PecDeckGlyph: EquipmentGlyph = () => (
  <>
    {/* seat + back */}
    <rect x="20" y="30" width="8" height="8" rx="1.5" />
    <line x1="24" y1="30" x2="24" y2="18" />
    {/* wing pads ★ (front view) */}
    <rect x="9.5" y="15" width="4.5" height="15" rx="2.2" stroke={ACCENT} strokeWidth={2.2} />
    <rect x="34" y="15" width="4.5" height="15" rx="2.2" stroke={ACCENT} strokeWidth={2.2} />
    {/* connecting arms */}
    <line x1="14" y1="22" x2="22" y2="22" />
    <line x1="34" y1="22" x2="26" y2="22" />
    <Ground />
  </>
);

export const ShoulderPressMachineGlyph: EquipmentGlyph = () => (
  <>
    {/* seat back + pad */}
    <line x1="16" y1="24" x2="16" y2="36" />
    <line x1="16" y1="36" x2="26" y2="36" strokeWidth={2.5} />
    {/* frame crossbar */}
    <line x1="14" y1="22" x2="34" y2="22" />
    {/* overhead converging handles ★ */}
    <line x1="14" y1="22" x2="20" y2="10" strokeWidth={2.4} stroke={ACCENT} />
    <line x1="34" y1="22" x2="28" y2="10" strokeWidth={2.4} stroke={ACCENT} />
    <Ground />
  </>
);

export const HipThrustMachineGlyph: EquipmentGlyph = () => (
  <>
    {/* low bench pad */}
    <rect x="8" y="28" width="17" height="4.5" rx="2" />
    <path d="M11 32.5 L11 40" />
    {/* hip belt arc ★ */}
    <path d="M21 28 C25 21 32 21 35 28" strokeWidth={2.4} stroke={ACCENT} />
    {/* footplate */}
    <rect x="36" y="26" width="4" height="13" rx="1.2" />
    <Ground />
  </>
);

export const CalfRaiseMachineGlyph: EquipmentGlyph = () => (
  <>
    {/* shoulder-pad yoke */}
    <rect x="14" y="11" width="20" height="4" rx="2" />
    <line x1="16" y1="15" x2="16" y2="31" />
    <line x1="32" y1="15" x2="32" y2="31" />
    {/* standing block/step, top edge ★ */}
    <rect x="16" y="32" width="16" height="6" rx="1.2" />
    <line x1="16" y1="32" x2="32" y2="32" strokeWidth={2.6} stroke={ACCENT} />
    <Ground />
  </>
);
