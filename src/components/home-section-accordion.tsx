"use client";

import { useState } from "react";
import type { ReactNode } from "react";

export function HomeSectionAccordion(props: {
  id?: string;
  kicker: string;
  title: string;
  description: string;
  badge?: string;
  closedSummary?: ReactNode;
  defaultOpen?: boolean;
  openLabel?: string;
  closeLabel?: string;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(props.defaultOpen ?? false);

  return (
    <section id={props.id} className="relative z-10 mb-8 terminal-panel">
      <div className="panel-body">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="section-kicker">{props.kicker}</div>
            <h2 className="section-title mt-3">{props.title}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">{props.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {props.badge ? <div className="tt-chip tt-chip-accent">{props.badge}</div> : null}
            <button
              type="button"
              className="tt-button"
              aria-expanded={isOpen}
              onClick={() => setIsOpen((current) => !current)}
            >
              <span>{isOpen ? props.closeLabel ?? "Hide section" : props.openLabel ?? "Open section"}</span>
            </button>
          </div>
        </div>

        {!isOpen && props.closedSummary ? <div className="tt-subpanel-soft">{props.closedSummary}</div> : null}

        {isOpen ? props.children : null}
      </div>
    </section>
  );
}
