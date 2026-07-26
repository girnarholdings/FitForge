/**
 * Two icons the shared set does not carry, drawn to the SAME contract as `@/components/ui/icons`
 * (24 viewBox, 1.75 stroke, round caps/joins, `currentColor`, sized by prop). They live here
 * rather than in the shared file because the safety card is the only surface that needs them —
 * and because `components/ui/icons.tsx` belongs to another workstream. Never emoji.
 */
import * as React from 'react';

export interface SafetyIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
}

function Svg({ size = 24, children, ...props }: SafetyIconProps & { children: React.ReactNode }) {
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

/** Warning triangle — urgent tier. */
export const AlertIcon = (p: SafetyIconProps) => (
  <Svg {...p}>
    <path d="M10.6 3.9 2.4 18a1.6 1.6 0 0 0 1.4 2.4h16.4a1.6 1.6 0 0 0 1.4-2.4L13.4 3.9a1.6 1.6 0 0 0-2.8 0Z" />
    <path d="M12 9v4.5M12 17h.01" />
  </Svg>
);

/** Stethoscope — "see a professional" tier. */
export const StethoscopeIcon = (p: SafetyIconProps) => (
  <Svg {...p}>
    <path d="M5 3v5a4 4 0 0 0 8 0V3" />
    <path d="M3.5 3H5M11.5 3H13" />
    <path d="M9 12v2.5a5 5 0 0 0 5 5 4 4 0 0 0 4-4v-2" />
    <circle cx="18" cy="8" r="2.2" />
  </Svg>
);
