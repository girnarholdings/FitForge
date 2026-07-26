'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/* --------------------------------------------------------------------------------- hooks */

/**
 * `prefers-reduced-motion: reduce`, live. Every decorative animation in the deck is gated on
 * this in JS (not just CSS) so reduced-motion users never see a frozen half-played effect.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return reduced;
}

/* --------------------------------------------------------------------------------- types */

export type BurstKind = 'spark' | 'ripple';

export interface BurstSpec {
  /** bump this to (re)play the burst — the component keys its DOM off it */
  id: number;
  /** origin in px, relative to the nearest positioned ancestor */
  x: number;
  y: number;
  kind: BurstKind;
  /** 1 = card-sized burst; ~2 = the finish-screen celebration */
  power?: number;
}

/* ---------------------------------------------------------------------------- generation */

const PARTICLE_COLORS = [
  'var(--accent)',
  'var(--accent-soft)',
  'var(--accent-hover)',
  'var(--energy)',
  'var(--accent)',
];

/** Deterministic hash-noise — no RNG, so a re-render can never reshuffle a playing burst. */
function noise(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

interface Particle {
  key: number;
  tx: number;
  ty: number;
  rot: number;
  size: number;
  color: string;
  delay: number;
  dur: number;
  radius: string;
  scale: number;
}

function makeParticles(seed: number, count: number, power: number): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const a = noise(seed + i * 7.13);
    const b = noise(seed + i * 3.71 + 91);
    const c = noise(seed + i * 11.9 + 17);
    const d = noise(seed + i * 5.27 + 233);
    // Even fan around the circle with a little jitter, squashed vertically and lifted a touch
    // so the burst reads as "thrown up" rather than a perfect ring.
    const angle = (i / count) * Math.PI * 2 + (a - 0.5) * 0.55;
    const dist = (44 + b * 72) * power;
    out.push({
      key: i,
      tx: Math.cos(angle) * dist,
      ty: Math.sin(angle) * dist * 0.84 - 16 * power * c,
      rot: (c - 0.5) * 420,
      size: 3 + Math.round(d * 4) * (power > 1.4 ? 2 : 1),
      color: PARTICLE_COLORS[i % PARTICLE_COLORS.length]!,
      delay: Math.round(a * 70),
      dur: Math.round(440 + b * 180),
      radius: d > 0.55 ? '9999px' : '1.5px',
      scale: 0.45 + c * 0.65,
    });
  }
  return out;
}

/* ---------------------------------------------------------------------------- component */

/**
 * A one-shot, GPU-cheap celebration burst (transform + opacity only, < 620ms).
 *
 * Renders nothing at all when `prefers-reduced-motion: reduce` is set, and unmounts its own
 * particles when the animation ends, so a parent can hold a stale `BurstSpec` for free. The host
 * must be `position: relative` — the burst is an inset-0, `pointer-events: none` overlay, so it
 * can never shift layout or eat a tap.
 */
export function Confetti({
  burst,
  className,
  'data-testid': testId,
}: {
  burst: BurstSpec | null;
  className?: string;
  'data-testid'?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [liveId, setLiveId] = React.useState<number | null>(null);

  const id = burst?.id ?? null;
  React.useEffect(() => {
    if (id === null || reduced) {
      setLiveId(null);
      return;
    }
    setLiveId(id);
    const t = window.setTimeout(() => setLiveId(null), 780);
    return () => window.clearTimeout(t);
  }, [id, reduced]);

  const power = burst?.power ?? 1;
  const particles = React.useMemo(
    () =>
      burst && burst.kind === 'spark'
        ? makeParticles(burst.id + 1, Math.round(14 * Math.min(2.4, power)), power)
        : burst
          ? makeParticles(burst.id + 1, Math.round(5 * power), power * 0.55)
          : [],
    [burst, power],
  );

  if (!burst || reduced || liveId !== burst.id) return null;

  const ringSize = (burst.kind === 'ripple' ? 96 : 120) * power;

  return (
    <div
      aria-hidden
      data-testid={testId}
      className={cn('pointer-events-none absolute inset-0 overflow-visible', className)}
    >
      <div className="absolute" style={{ left: burst.x, top: burst.y, width: 0, height: 0 }}>
        <span
          key={`ring-${burst.id}`}
          className="ff-ripple absolute block rounded-full border-2 border-accent"
          style={
            {
              left: -ringSize / 2,
              top: -ringSize / 2,
              width: ringSize,
              height: ringSize,
              background:
                'radial-gradient(circle, color-mix(in srgb, var(--accent) 22%, transparent), transparent 68%)',
              '--ff-dur': burst.kind === 'ripple' ? '480ms' : '560ms',
            } as React.CSSProperties
          }
        />
        {particles.map((p) => (
          <span
            key={`${burst.id}-${p.key}`}
            className="ff-spark absolute block"
            style={
              {
                left: -p.size / 2,
                top: -p.size / 2,
                width: p.size,
                height: p.size,
                borderRadius: p.radius,
                backgroundColor: p.color,
                '--ff-tx': `${p.tx}px`,
                '--ff-ty': `${p.ty}px`,
                '--ff-rot': `${p.rot}deg`,
                '--ff-scale': String(p.scale),
                '--ff-dur': `${p.dur}ms`,
                '--ff-delay': `${p.delay}ms`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}
