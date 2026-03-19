"use client";

import type { GeneratedDraftRecord } from "@/src/lib/generated-drafts";

export function ComposeRunReference(props: {
  draft: Pick<GeneratedDraftRecord, "composeRunId" | "composeRunLogDir">;
  className?: string;
}) {
  if (!props.draft.composeRunId && !props.draft.composeRunLogDir) {
    return null;
  }

  return (
    <div className={props.className ?? "mt-2 space-y-2"}>
      {props.draft.composeRunId ? (
        <div className="text-xs uppercase tracking-[0.12em] text-cyan">
          run <span className="font-[family:var(--font-mono)] normal-case tracking-normal text-slate-200">{props.draft.composeRunId}</span>
        </div>
      ) : null}
      {props.draft.composeRunLogDir ? (
        <div className="text-xs text-slate-400">
          logs <span className="font-[family:var(--font-mono)] text-slate-300">{props.draft.composeRunLogDir}</span>
        </div>
      ) : null}
    </div>
  );
}
