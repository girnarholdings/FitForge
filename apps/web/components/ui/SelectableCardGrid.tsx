'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Card, CardTitle, CardDescription } from './Card';
import { CheckIcon } from './icons';

export interface SelectableOption<V extends string> {
  value: V;
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

export interface SelectableCardGridProps<V extends string> {
  options: ReadonlyArray<SelectableOption<V>>;
  value: V | V[] | null;
  onChange: (value: V) => void;
  /** single = radio semantics (goals primary, experience, location); multiple = toggles */
  mode?: 'single' | 'multiple';
  columns?: 1 | 2;
  /**
   * Multi-select only: badge each selection with its 1-based pick order instead of a plain check,
   * so "the first one you tap leads" is visible rather than a rule the user has to remember.
   * Requires `value` to be an ARRAY in selection order.
   */
  order?: boolean;
  className?: string;
}

/**
 * Card-grid picker used across onboarding (goals, experience, location, diet, §2.2).
 * `single` behaves like a radio group; `multiple` toggles membership.
 */
export function SelectableCardGrid<V extends string>({
  options,
  value,
  onChange,
  mode = 'single',
  columns = 1,
  order = false,
  className,
}: SelectableCardGridProps<V>) {
  const selectedList = React.useMemo(
    () => (Array.isArray(value) ? value : value ? [value] : []),
    [value],
  );
  const selectedSet = React.useMemo(() => new Set(selectedList), [selectedList]);

  return (
    <div
      role={mode === 'single' ? 'radiogroup' : 'group'}
      className={cn('grid gap-3', columns === 2 ? 'grid-cols-2' : 'grid-cols-1', className)}
    >
      {options.map((opt) => {
        const isSelected = selectedSet.has(opt.value);
        return (
          <Card
            key={opt.value}
            role={mode === 'single' ? 'radio' : 'checkbox'}
            aria-checked={isSelected}
            tabIndex={0}
            interactive
            selected={isSelected}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onChange(opt.value);
              }
            }}
            className="flex items-center gap-3.5 shadow-[var(--shadow-card)]"
          >
            {opt.icon && (
              <span
                aria-hidden
                className={cn(
                  'grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-colors',
                  isSelected ? 'bg-accent text-accent-foreground' : 'bg-accent-muted text-accent',
                )}
              >
                {opt.icon}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <CardTitle>{opt.title}</CardTitle>
              {opt.description && <CardDescription>{opt.description}</CardDescription>}
            </div>
            <span
              aria-hidden
              className={cn(
                'grid shrink-0 place-items-center rounded-full border transition-colors',
                order && mode === 'multiple' ? 'h-6 w-6 text-[11px] font-bold' : 'h-5 w-5',
                isSelected
                  ? 'border-accent bg-accent text-accent-foreground'
                  : 'border-border text-transparent',
              )}
            >
              {order && mode === 'multiple' ? (
                isSelected ? (
                  selectedList.indexOf(opt.value) + 1
                ) : null
              ) : (
                <CheckIcon size={13} />
              )}
            </span>
          </Card>
        );
      })}
    </div>
  );
}
