import * as React from 'react';
import type { Food } from '@/lib/food/types';

/**
 * THE FOOD ICON SET — drawn, not typed.
 *
 * Food rows used to wear emoji (🍗 🥛 🥤), which meant the one place the app shows the most rows
 * per inch was also the one place its icon system gave up: OS-dependent rendering, no relationship
 * to the stroke icons an inch away, and the unmistakable AI-template smell of glyphs standing in
 * for drawing. Every icon below is authored on the same grid as `components/ui/icons.tsx` —
 * 24×24, 1.75 stroke, round caps and joins, `currentColor` — so a chicken breast row and the
 * dumbbell tab finally speak one language.
 *
 * Resolution mirrors the retired emoji table: NAME KEYWORDS OUTRANK CATEGORY, first match wins,
 * ordered specific → generic ("salmon" gets the fish, not its category's generic meat).
 */
export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
}

function Svg({ size = 24, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/* ── proteins ─────────────────────────────────────────────────────────────── */

export const EggFoodIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5c-3.3 0-6.4 5.3-6.4 9.9a6.4 6.4 0 0 0 12.8 0c0-4.6-3.1-9.9-6.4-9.9Z" />
  </Svg>
);

export const DrumstickIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15.4 15.63a7.875 6 135 1 1 6.23-6.23 4.5 3.43 135 0 0-6.23 6.23" />
    <path d="m8.29 12.71-2.6 2.6a2.5 2.5 0 1 0-1.65 4.65A2.5 2.5 0 1 0 8.7 18.3l2.59-2.59" />
  </Svg>
);

export const SteakIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.2 13.9C3.5 10.2 5.9 5.5 10.1 4.5c3.4-.8 7 .6 8.6 3.1.9 1.5.9 3.3 0 4.7-2 3.1-5.5 5-9 4.7-2.1-.2-3.7-1.3-4.5-3.1Z" />
    <circle cx="15.9" cy="9.1" r="1.9" />
    <path d="M8.2 12.4c1.2-.9 2.6-1 3.9-.3" />
  </Svg>
);

export const BaconIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 9.5C6 6 8 6 10 8.5s4 2.5 6.4-.4c1.5-1.8 2.9-2 4.1-1.3" />
    <path d="M3.5 15.5C6 12 8 12 10 14.5s4 2.5 6.4-.4c1.5-1.8 2.9-2 4.1-1.3" />
  </Svg>
);

export const FishIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 12c2.2-3.6 5.2-5.4 8-5.4 2.4 0 4.5 1.9 6 5.4-1.5 3.5-3.6 5.4-6 5.4-2.8 0-5.8-1.8-8-5.4Z" />
    <path d="M7 12c-1.6-.5-3-1.6-4-3.2v6.4c1-1.6 2.4-2.7 4-3.2Z" />
    <path d="M16.6 10.5h.01" />
  </Svg>
);

/* ── dairy + drinks ───────────────────────────────────────────────────────── */

export const CheeseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 15.2 18.6 8.3c1-.4 2 .3 2 1.4V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18Z" />
    <circle cx="8.5" cy="15.9" r="1.15" />
    <circle cx="14.5" cy="14.4" r="1.15" />
  </Svg>
);

export const MilkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7.2 3.5h9.6l-1.2 15.9a1.5 1.5 0 0 1-1.5 1.4h-4.2a1.5 1.5 0 0 1-1.5-1.4Z" />
    <path d="M7.9 10h8.2" />
  </Svg>
);

export const YogurtIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.2 8.5h11.6l-1.2 10.7a1.6 1.6 0 0 1-1.6 1.4H9a1.6 1.6 0 0 1-1.6-1.4Z" />
    <path d="M5 8.5h14" />
    <path d="m14.5 8.5 3-5" />
  </Svg>
);

export const CoffeeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 9h11v5.2a5.3 5.3 0 0 1-5.3 5.3h-.4A5.3 5.3 0 0 1 5 14.2Z" />
    <path d="M16 10.3h1.4a2.65 2.65 0 0 1 0 5.3H16" />
    <path d="M8.6 5.8c-.5-.8.5-1.3 0-2.3M12.3 5.8c-.5-.8.5-1.3 0-2.3" />
  </Svg>
);

export const SodaIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 8.5h10l-1.3 10.7a1.5 1.5 0 0 1-1.5 1.3H9.8a1.5 1.5 0 0 1-1.5-1.3Z" />
    <path d="M6.4 8.5h11.2" />
    <path d="m13.4 6 3.1-3.5" />
  </Svg>
);

export const WaterIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5c3.2 4.1 6 7.2 6 10.6a6 6 0 0 1-12 0c0-3.4 2.8-6.5 6-10.6Z" />
  </Svg>
);

export const BeerIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 7h9v12a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 19Z" />
    <path d="M15.5 9.5h1.6a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1.6" />
    <path d="M6.5 7a2.6 2.6 0 0 1 2-4.3c.5 0 1 .14 1.4.4a3.4 3.4 0 0 1 4.6.8A2.3 2.3 0 0 1 15.5 7Z" />
  </Svg>
);

/* ── fruit + veg ──────────────────────────────────────────────────────────── */

export const BananaIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 6.8c.4 7.4 5.3 12 12.5 12 1.3 0 2.2-.4 2.7-1.3-5 .3-10.6-4.6-11.6-11.6-.1-.9-.7-1.5-1.7-1.5s-2 1-1.9 2.4Z" />
  </Svg>
);

export const BerryIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8.2" cy="10" r="2.6" />
    <circle cx="15.4" cy="8.7" r="2.6" />
    <circle cx="11.8" cy="15.6" r="2.6" />
    <path d="M15 5c.6-1 1.5-1.5 2.7-1.5" />
  </Svg>
);

export const CitrusIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.3" />
    <path d="M12 6.2v11.6M17 9.1l-10 5.8M17 14.9 7 9.1" />
  </Svg>
);

export const AvocadoIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5c1.9 3.4 6.3 5.4 6.3 9.8a6.3 6.3 0 0 1-12.6 0c0-4.4 4.4-6.4 6.3-9.8Z" />
    <circle cx="12" cy="14.2" r="2.5" />
  </Svg>
);

export const LeafyIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19.2 4.8C10.6 4.8 4.8 10.6 4.8 19.2c8.6 0 14.4-5.8 14.4-14.4Z" />
    <path d="M5.2 18.8C9.4 14.6 14.6 9.4 18.8 5.2" />
  </Svg>
);

export const CarrotIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15.7 8.3c1.9 1.9 1 5-1.8 7.8-2.3 2.3-8 4.7-10.3 3.9-.8-2.3 1.6-8 3.9-10.3 2.8-2.8 6.3-3.3 8.2-1.4Z" />
    <path d="m9 15-1.6-1.6M12.5 13.4l-1.9-1.9" />
    <path d="M17.6 6.4c1.4-1.4 3.2-1.9 4.4-1.2-.2 1.4-1.3 2.9-3.2 3.3M17.6 6.4c1.4-1.4 1.9-3.2 1.2-4.4-1.4.2-2.9 1.3-3.3 3.2" />
  </Svg>
);

export const BroccoliIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 15.3a3.8 3.8 0 0 1-1.6-7.2A4.7 4.7 0 0 1 12 4.2a4.7 4.7 0 0 1 6.6 3.9A3.8 3.8 0 0 1 17 15.3Z" />
    <path d="m9.9 15.3-.5 4.3a1.5 1.5 0 0 0 1.5 1.7h2.2a1.5 1.5 0 0 0 1.5-1.7l-.5-4.3" />
  </Svg>
);

export const PotatoIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.9 13.6c-1.3-3.9 1.7-8.3 5.7-9.2 4-1 8.4 1.6 9.2 5.5.8 4-2.4 8.4-6.9 8.8-4.4.4-6.9-1.5-8-5.1Z" />
    <path d="M9 10.2h.01M14.6 9.4h.01M12.2 14.6h.01" />
  </Svg>
);

export const CornIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 3.9C7.8 5.6 6.9 8.6 6.9 12s.9 6.4 2.6 8.1c.7.7 1.6 1.1 2.5 1.1s1.8-.4 2.5-1.1c1.7-1.7 2.6-4.7 2.6-8.1s-.9-6.4-2.6-8.1A3.5 3.5 0 0 0 12 2.8c-.9 0-1.8.4-2.5 1.1Z" />
    <path d="M12 3v18M7.6 8.2h8.8M7.6 15.8h8.8" />
  </Svg>
);

/* ── grains + carbs ───────────────────────────────────────────────────────── */

export const BreadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 10.4a4 4 0 0 1 2.2-7.3c.6 0 1.2.13 1.7.4A6.4 6.4 0 0 1 12 2.9c1.1 0 2.2.2 3.1.6.5-.27 1.1-.4 1.7-.4a4 4 0 0 1 2.2 7.3V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19Z" />
  </Svg>
);

export const RiceIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12.5h16a8 8 0 0 1-5 7v1h-6v-1a8 8 0 0 1-5-7Z" />
    <path d="M7.6 12.5c-.3-2 .9-3.6 2.6-3.7.5-1.4 3.1-1.4 3.6 0 1.7.1 2.9 1.7 2.6 3.7" />
  </Svg>
);

export const NoodlesIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12.5h16a8 8 0 0 1-5 7v1h-6v-1a8 8 0 0 1-5-7Z" />
    <path d="M9 12V7.3M12 12V6.8M15 12V7.3" />
    <path d="m15.2 3 3.6 5.6M17.7 2.2l3 5" />
  </Svg>
);

export const OatsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12.5h16a8 8 0 0 1-5 7v1h-6v-1a8 8 0 0 1-5-7Z" />
    <path d="m16.6 9.5 2.6-5.7" />
    <circle cx="10.4" cy="9.3" r="1.1" />
  </Svg>
);

export const WheatIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21v-4.5" />
    <path d="M12 16.5c-2.6 0-4.2-1.6-4.2-4.2 2.6 0 4.2 1.6 4.2 4.2Zm0 0c2.6 0 4.2-1.6 4.2-4.2-2.6 0-4.2 1.6-4.2 4.2Z" />
    <path d="M12 11.7c-2.4 0-3.9-1.5-3.9-3.9 2.4 0 3.9 1.5 3.9 3.9Zm0 0c2.4 0 3.9-1.5 3.9-3.9-2.4 0-3.9 1.5-3.9 3.9Z" />
    <path d="M12 7.4c-1.8 0-2.9-1.1-2.9-2.9 1.8 0 2.9 1.1 2.9 2.9Zm0 0c1.8 0 2.9-1.1 2.9-2.9-1.8 0-2.9 1.1-2.9 2.9Z" />
  </Svg>
);

export const PancakesIcon = (p: IconProps) => (
  <Svg {...p}>
    <ellipse cx="12" cy="7.6" rx="7.4" ry="2.7" />
    <path d="M4.6 7.6v3.6c0 1.5 3.3 2.7 7.4 2.7s7.4-1.2 7.4-2.7V7.6" />
    <path d="M3.2 18h17.6" />
    <path d="M10.6 5.4h2.8v2.2h-2.8Z" />
  </Svg>
);

/* ── dishes ───────────────────────────────────────────────────────────────── */

export const PizzaIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21 4.7 6.6a16.4 16.4 0 0 1 14.6 0Z" />
    <path d="M6.3 9.8a12.7 12.7 0 0 1 11.4 0" />
    <circle cx="10.6" cy="12.1" r="1.1" />
    <circle cx="13.2" cy="15.4" r="1.1" />
  </Svg>
);

export const BurgerIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.2 9.6C4.2 6.2 7.7 3.7 12 3.7s7.8 2.5 7.8 5.9Z" />
    <path d="M4.2 13h15.6" />
    <path d="M4.2 16.4h15.6a2 2 0 0 1-2 2H6.2a2 2 0 0 1-2-2Z" />
    <path d="M9.4 6.7h.01M13.8 6.7h.01" />
  </Svg>
);

export const BurritoIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 15.4C4 10.9 10.9 4 15.4 4 17.9 4 20 6.1 20 8.6 20 13.1 13.1 20 8.6 20 6.1 20 4 17.9 4 15.4Z" />
    <path d="M8.3 9.2c1.5.6 3 2 3.6 3.6M11.6 6.3c1.5.6 3 2 3.6 3.6" />
  </Svg>
);

export const TacoIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 18.5a8.5 8.5 0 0 1 17 0Z" />
    <path d="M6.8 18.5a5.2 5.2 0 0 1 10.4 0" />
    <path d="M9 10.2c.8-.8 1.6-.4 2.3.2M13.3 9.6c.8-.8 1.6-.4 2.3.2" />
  </Svg>
);

export const SandwichIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m3.6 16.2 8.4-8.4 8.4 8.4c.8.8.2 2.1-.9 2.1H4.5c-1.1 0-1.7-1.3-.9-2.1Z" />
    <path d="M7.4 12.4c3 1.4 6.2 1.4 9.2 0" />
  </Svg>
);

export const SoupIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12.5h16a8 8 0 0 1-5 7v1h-6v-1a8 8 0 0 1-5-7Z" />
    <path d="M9.3 9.2c-.6-1 .6-1.7 0-2.9M13.9 9.2c-.6-1 .6-1.7 0-2.9" />
  </Svg>
);

export const DumplingIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 16.5a8 8 0 0 1 16 0 2.6 2.6 0 0 1-2.6 2.6H6.6A2.6 2.6 0 0 1 4 16.5Z" />
    <path d="M9 9.3c.3-1.2 1-2 1.7-2.4M12.4 8.7c.3-1.2 1-2 1.7-2.4M15.6 9.6c.4-1 1.2-1.8 1.9-2" />
  </Svg>
);

export const PlateIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.4" />
    <circle cx="12" cy="12" r="4.6" />
  </Svg>
);

/* ── snacks + sweets ──────────────────────────────────────────────────────── */

export const NutIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.2 9.6c0-3.2 2.6-5.7 5.8-5.7s5.8 2.5 5.8 5.7c0 .5-.4.9-.9.9H7.1a.9.9 0 0 1-.9-.9Z" />
    <path d="M7.2 10.5c0 4.5 2 7.9 4.8 9.7 2.8-1.8 4.8-5.2 4.8-9.7" />
    <path d="M12 3.9V2.4" />
  </Svg>
);

export const ChocolateIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="4.5" width="14" height="15" rx="1.6" />
    <path d="M12 4.5v15M5 12h14" />
  </Svg>
);

export const CookieIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.3" />
    <path d="M9 9.4h.01M14.7 8.9h.01M10.1 14.8h.01M15 13.9h.01" />
  </Svg>
);

export const CakeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5h14V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19Z" />
    <path d="M5 15.2c1.6 1.2 3-1.2 4.7 0s3-1.2 4.6 0 3-1.2 4.7 0" />
    <path d="M12 9.5v3M12 5.6h.01" />
  </Svg>
);

export const PopcornIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6.3 9.7 1.5 10.8h8.4l1.5-10.8" />
    <path d="M10.1 9.7l.6 10.8M13.9 9.7l-.6 10.8" />
    <path d="M6.1 9.6a2.4 2.4 0 0 1 1.3-4.3 2.6 2.6 0 0 1 4.6-1.5 2.6 2.6 0 0 1 4.6 1.5 2.4 2.4 0 0 1 1.3 4.3" />
  </Svg>
);

export const IceCreamIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7.2 11.5a5.3 5.3 0 1 1 9.6 0" />
    <path d="M7.2 11.5h9.6L12 21.2Z" />
  </Svg>
);

/* ── pantry ───────────────────────────────────────────────────────────────── */

export const BeansIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.4" y="7.4" width="9" height="5.4" rx="2.7" transform="rotate(-30 7.9 10.1)" />
    <rect x="11.6" y="12.2" width="9" height="5.4" rx="2.7" transform="rotate(-30 16.1 14.9)" />
  </Svg>
);

export const OilIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.2 3.5h3.6" />
    <path d="M11 3.5v2.9l-3.1 4.1a2.4 2.4 0 0 0-.5 1.5v6A2.5 2.5 0 0 0 9.9 20.5h4.2a2.5 2.5 0 0 0 2.5-2.5v-6c0-.55-.17-1.07-.5-1.5L13 6.4V3.5" />
    <path d="M10.4 15.4h3.2" />
  </Svg>
);

export const ButterIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 13.7h16v3.2a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 16.9Z" />
    <path d="M7.8 13.7v-3.5a1.5 1.5 0 0 1 1.5-1.5h5.4a1.5 1.5 0 0 1 1.5 1.5v3.5" />
  </Svg>
);

export const HoneyIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7.1 8.7a6.3 6.3 0 0 0-2.4 4.9c0 3.5 3.2 6.4 7.3 6.4s7.3-2.9 7.3-6.4a6.3 6.3 0 0 0-2.4-4.9" />
    <path d="M6.7 8.7h10.6" />
    <path d="M10.4 8.7V7a1.4 1.4 0 0 1 1.4-1.4h.4A1.4 1.4 0 0 1 13.6 7v1.7" />
  </Svg>
);

export const SaltIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.6 9 7.5 19a1.6 1.6 0 0 0 1.6 1.8h5.8a1.6 1.6 0 0 0 1.6-1.8L15.4 9Z" />
    <path d="M8.6 9V6.3A3.4 3.4 0 0 1 12 2.9a3.4 3.4 0 0 1 3.4 3.4V9" />
    <path d="M11 5.9h.01M13.2 5.9h.01" />
  </Svg>
);

/* ── supplements ──────────────────────────────────────────────────────────── */

export const ShakerIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7.6 9.2h8.8l-.9 9.7a1.8 1.8 0 0 1-1.8 1.6h-3.4a1.8 1.8 0 0 1-1.8-1.6Z" />
    <path d="m7.2 9.2.9-2.9h7.8l.9 2.9" />
    <path d="M10.6 6.3V4.7a1.2 1.2 0 0 1 1.2-1.2h.4a1.2 1.2 0 0 1 1.2 1.2v1.6" />
    <path d="M9.2 12.7h1.6M9.5 15.7h1.3" />
  </Svg>
);

export const ProteinBarIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.4" y="8.2" width="17.2" height="7.6" rx="2" />
    <path d="M9.1 8.2v7.6M14.9 8.2v7.6" />
  </Svg>
);

export const CapsuleIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4.2" y="9.4" width="15.6" height="5.2" rx="2.6" transform="rotate(-38 12 12)" />
    <path d="m9.4 8.5 5.2 7" />
  </Svg>
);

/* Reused from the main set so the two families can never drift apart. */
export const AppleFoodIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 8c-1.5-1.5-4-2-5.5-.5C4.7 9 5 12.5 6.5 15.5 7.6 17.7 9 20 12 20s4.4-2.3 5.5-4.5C19 12.5 19.3 9 17.5 7.5 16 6 13.5 6.5 12 8Z" />
    <path d="M12 8c0-1.5.3-3.2 2-4" />
  </Svg>
);

/* ── the resolver ─────────────────────────────────────────────────────────── */

type FoodIconComponent = React.ComponentType<IconProps>;

const BY_KEYWORD: Array<[RegExp, FoodIconComponent]> = [
  [/pizza/i, PizzaIcon],
  [/burger|cheeseburg/i, BurgerIcon],
  [/burrito|wrap\b/i, BurritoIcon],
  [/taco/i, TacoIcon],
  [/sushi|sashimi|maki/i, FishIcon],
  [/ramen|noodle|pho\b|udon/i, NoodlesIcon],
  [/spaghetti|pasta|penne|macaroni|lasagn/i, NoodlesIcon],
  [/curry\b/i, RiceIcon],
  [/fries|chips\b/i, PopcornIcon],
  [/sandwich|sub\b|hoagie/i, SandwichIcon],
  [/hot ?dog|sausage|bratwurst/i, BaconIcon],
  [/pancake|waffle/i, PancakesIcon],
  [/croissant|bagel|bread|toast|baguette|roll\b/i, BreadIcon],
  [/donut|doughnut|cookie|biscuit/i, CookieIcon],
  [/cake|brownie|muffin|cupcake|pie\b|tart\b/i, CakeIcon],
  [/chocolate|cocoa/i, ChocolateIcon],
  [/ice ?cream|gelato|sundae/i, IceCreamIcon],
  [/rice\b|risotto|pilaf|biryani/i, RiceIcon],
  [/oat|porridge|muesli|granola|cereal/i, OatsIcon],
  [/egg/i, EggFoodIcon],
  [/bacon/i, BaconIcon],
  [/chicken|turkey|poultry/i, DrumstickIcon],
  [/steak|beef|lamb|pork|veal|ham\b/i, SteakIcon],
  [/salmon|tuna|cod\b|tilapia|trout|sardine|mackerel|fish/i, FishIcon],
  [/shrimp|prawn/i, FishIcon],
  [/cheese|paneer/i, CheeseIcon],
  [/yogurt|yoghurt|kefir|skyr/i, YogurtIcon],
  [/milk\b|latte|cappuccino/i, MilkIcon],
  [/coffee|espresso|americano|tea\b|matcha|chai/i, CoffeeIcon],
  [/juice|smoothie|shake\b|soda|cola/i, SodaIcon],
  [/beer|lager|ale\b|wine/i, BeerIcon],
  [/water\b/i, WaterIcon],
  [/avocado|guacamole/i, AvocadoIcon],
  [/banana/i, BananaIcon],
  [/apple\b|peach|nectarine|apricot|mango|pear\b/i, AppleFoodIcon],
  [/orange\b|mandarin|clementine|lemon|lime\b|grapefruit/i, CitrusIcon],
  [/strawberr|blueberr|raspberr|blackberr|berries|grape|cherr/i, BerryIcon],
  [/watermelon|pineapple|kiwi|melon/i, CitrusIcon],
  [/tomato/i, AppleFoodIcon],
  [/carrot/i, CarrotIcon],
  [/broccoli|cauliflower/i, BroccoliIcon],
  [/corn\b|maize/i, CornIcon],
  [/potato|yam\b/i, PotatoIcon],
  [/salad|lettuce|greens|spinach|kale|cucumber|zucchini|courgette|pepper\b|capsicum|onion|garlic|mushroom|vegetable/i, LeafyIcon],
  [/peanut|almond|cashew|walnut|pistachio|pecan|nut\b|nuts\b|seed/i, NutIcon],
  [/bean|lentil|dal\b|dahl|chickpea|hummus|tofu|edamame|tempeh/i, BeansIcon],
  [/soup|broth|stew|chowder/i, SoupIcon],
  [/honey|jam\b|syrup/i, HoneyIcon],
  [/butter\b|ghee|margarine/i, ButterIcon],
  [/oil\b|olive/i, OilIcon],
  [/salt|spice|seasoning|sauce|ketchup|mustard|mayo|dressing/i, SaltIcon],
  [/protein bar|granola bar|energy bar/i, ProteinBarIcon],
  [/protein (powder|shake)|whey|casein|mass gainer|collagen/i, ShakerIcon],
  [/creatine|supplement|vitamin/i, CapsuleIcon],
  [/popcorn|pretzel|cracker/i, PopcornIcon],
  [/dumpling|gyoza|momo/i, DumplingIcon],
];

const BY_CATEGORY: Record<Food['category'], FoodIconComponent> = {
  fruit: AppleFoodIcon,
  vegetable: LeafyIcon,
  grain: WheatIcon,
  meat: SteakIcon,
  fish: FishIcon,
  dairy: MilkIcon,
  legume: BeansIcon,
  nuts: NutIcon,
  beverage: SodaIcon,
  snack: PopcornIcon,
  condiment: SaltIcon,
  fastfood: BurgerIcon,
  dish: PlateIcon,
  soup: SoupIcon,
  breakfast: PancakesIcon,
  supplement: CapsuleIcon,
};

export function iconForFood(food: Pick<Food, 'name' | 'category'>): FoodIconComponent {
  for (const [re, icon] of BY_KEYWORD) {
    if (re.test(food.name)) return icon;
  }
  return BY_CATEGORY[food.category] ?? PlateIcon;
}

/**
 * The standard seat for a food icon in a row: a small warm tile with the glyph in copper, the
 * same treatment every other icon-bearing row in the app uses — so food rows stop being the one
 * list with a different (and OS-dependent) visual voice.
 */
export function FoodGlyph({
  food,
  size = 18,
  className,
  ...props
}: { food: Pick<Food, 'name' | 'category'> } & IconProps) {
  const Icon = iconForFood(food);
  return <Icon size={size} className={className} {...props} />;
}
