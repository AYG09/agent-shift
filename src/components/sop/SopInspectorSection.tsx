'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Accordion section for the step inspector and other dense side panels.
 *
 * The customer feedback driving this: both workspace side panels showed every
 * field of every concern at once, so nothing was scannable. Each concern now
 * lives in a titled section the member opens on demand; a compact `summary`
 * chip keeps the current value visible while collapsed.
 *
 * Children stay MOUNTED while collapsed (CSS `hidden`, not conditional
 * rendering) — collapsing is a purely visual affordance, so form state,
 * uncontrolled inputs, and the existing read-only guard tests keep working
 * against a fully rendered tree.
 */
export const SopInspectorSection: React.FC<{
    title: string;
    /** Compact current-value preview (e.g. "A01 · #1", "3개") shown next to the title. */
    summary?: string;
    defaultOpen?: boolean;
    /** Visual emphasis for sections that currently need member attention. */
    tone?: 'default' | 'attention';
    children: React.ReactNode;
}> = ({ title, summary, defaultOpen = false, tone = 'default', children }) => {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <section
            className={`rounded-xl border ${
                tone === 'attention' ? 'border-amber-300 bg-amber-50/50' : 'border-zinc-200 bg-white'
            }`}
        >
            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                aria-expanded={open}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left hover:bg-zinc-50"
            >
                <span className="min-w-0 flex-1 truncate text-xs font-bold text-zinc-900">{title}</span>
                {summary && (
                    <span
                        className={`max-w-[45%] shrink-0 truncate rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${
                            tone === 'attention'
                                ? 'border-amber-300 bg-amber-100 text-amber-800'
                                : 'border-zinc-200 bg-zinc-50 text-zinc-600'
                        }`}
                    >
                        {summary}
                    </span>
                )}
                <ChevronDown
                    className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`}
                />
            </button>
            <div className={open ? 'space-y-3 px-3 pb-3' : 'hidden'}>{children}</div>
        </section>
    );
};
