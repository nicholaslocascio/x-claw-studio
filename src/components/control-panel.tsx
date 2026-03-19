"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RunHistoryEntry, RunTask, SchedulerConfig } from "@/src/lib/types";

interface ControlPanelProps {
  schedulerConfig: SchedulerConfig;
  runHistory: RunHistoryEntry[];
  xAuthWarning?: {
    runControlId: string;
    task: RunTask;
    startedAt: string;
    logPath: string;
    reason: string;
  } | null;
}

interface XAuthStatus {
  configured: boolean;
  appBaseUrl: string;
  redirectUri: string;
  missing: string[];
  connected: boolean;
  activeAccountId?: string | null;
  error: string | null;
  auth: {
    accountId: string;
    label: string | null;
    username: string | null;
    userId: string | null;
    expiresAt: string | null;
    scope?: string | null;
  } | null;
  accounts?: Array<{
    accountId: string;
    label: string | null;
    username: string | null;
    userId: string | null;
    expiresAt: string | null;
    scope?: string | null;
  }>;
}

const MANUAL_ACTIONS: Array<{
  task: RunTask;
  title: string;
  description: string;
  tone?: "primary" | "secondary";
}> = [
  {
    task: "crawl_x_api",
    title: "Capture latest timeline",
    description: "Pull the authenticated home timeline and save tweets plus media.",
    tone: "primary"
  },
  {
    task: "capture_priority_accounts",
    title: "Capture priority accounts",
    description: "Check watched accounts for any new posts and save them separately."
  },
  {
    task: "capture_x_api_timeline",
    title: "Capture timeline window",
    description: "Pull another bounded slice of the timeline."
  },
  {
    task: "capture_x_api_tweet",
    title: "Capture one tweet",
    description: "Look up one tweet by URL and save its assets."
  },
  {
    task: "capture_x_api_tweet_and_compose_replies",
    title: "Capture tweet and draft replies",
    description: "Look up one tweet by URL, then generate reply drafts for every reply goal."
  },
  {
    task: "analyze_missing",
    title: "Analyze unreviewed media",
    description: "Fill in missing media analysis."
  },
  {
    task: "analyze_topics",
    title: "Refresh topics",
    description: "Rebuild topic labels and the topic index."
  },
  {
    task: "crawl_timeline",
    title: "Run browser fallback capture",
    description: "Use the Playwright crawler when API capture is not enough."
  },
  {
    task: "rebuild_media_assets",
    title: "Refresh media groups",
    description: "Recompute grouping, fingerprints, duplicate groups, and similarity matches."
  },
  {
    task: "backfill_media_native_types",
    title: "Repair saved media files",
    description: "Create native image or video files for saved `.bin` media and repoint manifests."
  }
];

const ACTION_GROUPS: Array<{ title: string; description: string; tasks: RunTask[] }> = [
  {
    title: "Capture now",
    description: "Pull in new tweets or capture one tweet when you already know the URL.",
    tasks: ["crawl_x_api", "capture_priority_accounts", "capture_x_api_timeline", "capture_x_api_tweet", "capture_x_api_tweet_and_compose_replies", "crawl_timeline"]
  },
  {
    title: "Refresh data",
    description: "Use these after capture when you need analysis, topic refresh, or media regrouping.",
    tasks: ["analyze_missing", "analyze_topics", "rebuild_media_assets", "backfill_media_native_types"]
  }
];

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function toTimeInput(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function ControlPanel({ schedulerConfig, runHistory, xAuthWarning = null }: ControlPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(schedulerConfig.enabled);
  const [timesValue, setTimesValue] = useState(
    (schedulerConfig.times?.length ? schedulerConfig.times : [toTimeInput(schedulerConfig.hour, schedulerConfig.minute)]).join(", ")
  );
  const [xStatusUrl, setXStatusUrl] = useState("");
  const [timezone, setTimezone] = useState(schedulerConfig.timezone);
  const [topicBatchLimit, setTopicBatchLimit] = useState("100");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<RunHistoryEntry | null>(null);
  const [logContent, setLogContent] = useState("");
  const [xAuthStatus, setXAuthStatus] = useState<XAuthStatus | null>(null);
  const [xConnectUsername, setXConnectUsername] = useState("");
  const [xConnectUserId, setXConnectUserId] = useState("");
  const [xConnectLabel, setXConnectLabel] = useState("");
  const [xSelectedAccountId, setXSelectedAccountId] = useState("");

  const recentFailures = useMemo(() => runHistory.filter((entry) => entry.status === "failed"), [runHistory]);
  const activeRuns = useMemo(() => runHistory.filter((entry) => entry.status === "running"), [runHistory]);
  const latestFailure = recentFailures[0] ?? null;
  const groupedActions = useMemo(
    () =>
      ACTION_GROUPS.map((group) => ({
        ...group,
        actions: group.tasks
          .map((task) => MANUAL_ACTIONS.find((action) => action.task === task))
          .filter((action): action is (typeof MANUAL_ACTIONS)[number] => Boolean(action))
      })),
    []
  );

  function buildXOauthStartUrl(): string {
    const params = new URLSearchParams();
    if (xConnectUsername.trim()) params.set("username", xConnectUsername.trim().replace(/^@/, ""));
    if (xConnectUserId.trim()) params.set("userId", xConnectUserId.trim());
    if (xConnectLabel.trim()) params.set("label", xConnectLabel.trim());
    return `/api/x/oauth/start${params.toString() ? `?${params.toString()}` : ""}`;
  }

  function startXOauthFlow(): void {
    window.location.href = buildXOauthStartUrl();
  }

  async function loadXAuthStatus(): Promise<void> {
    try {
      const response = await fetch("/api/x/oauth/status");
      const data = (await response.json().catch(() => null)) as XAuthStatus | null;
      if (!data) {
        setStatusMessage("Failed to load X auth status");
        return;
      }

      setXAuthStatus(data);
      setXSelectedAccountId(data.activeAccountId ?? data.auth?.accountId ?? data.accounts?.[0]?.accountId ?? "");
      if (data.error) {
        setStatusMessage(data.error);
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to load X auth status");
    }
  }

  useEffect(() => {
    let cancelled = false;

    fetch("/api/x/oauth/status")
      .then((response) => response.json().catch(() => null))
      .then((data) => {
        if (cancelled || !data) {
          return;
        }

        setXAuthStatus(data as XAuthStatus);
        if ((data as XAuthStatus).error) {
          setStatusMessage((data as XAuthStatus).error);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setStatusMessage(error instanceof Error ? error.message : "Failed to load X auth status");
        }
      });

    const params = new URLSearchParams(window.location.search);
    const xAuth = params.get("x_auth");
    const message = params.get("message");
    if (xAuth === "connected") {
      window.setTimeout(() => {
        setStatusMessage("X connected.");
      }, 0);
    } else if (xAuth === "error") {
      window.setTimeout(() => {
        setStatusMessage(message || "X connection failed.");
      }, 0);
    }

    return () => {
      cancelled = true;
    };
  }, []);

  async function saveSchedule(): Promise<void> {
    try {
      const times = timesValue
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const response = await fetch("/api/control/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, times, timezone })
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setStatusMessage(data?.error || "Failed to save schedule");
        return;
      }

      setStatusMessage("Schedule saved.");
      router.refresh();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to save schedule");
    }
  }

  async function triggerRun(task: RunTask): Promise<void> {
    try {
      const parsedTopicBatchLimit = Number(topicBatchLimit);
      const normalizedTopicBatchLimit =
        Number.isInteger(parsedTopicBatchLimit) && parsedTopicBatchLimit > 0 ? parsedTopicBatchLimit : 100;
      const response = await fetch("/api/control/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task,
          xStatusUrl: xStatusUrl.trim() ? xStatusUrl.trim() : null,
          topicBatchLimit: task === "analyze_topics" ? normalizedTopicBatchLimit : null
        })
      });
      const data = (await response.json().catch(() => null)) as
        | RunHistoryEntry
        | { error?: string }
        | null;

      if (!response.ok) {
        const message =
          data && "error" in data && data.error ? data.error : `Failed to trigger ${task}`;
        setStatusMessage(message);
        return;
      }

      const entry = data as RunHistoryEntry;
      setStatusMessage(`Triggered ${task}: ${entry.runControlId}`);
      router.refresh();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : `Failed to trigger ${task}`);
    }
  }

  async function loadLog(entry: RunHistoryEntry): Promise<void> {
    try {
      const params = new URLSearchParams({ path: entry.logPath });
      const response = await fetch(`/api/control/log?${params.toString()}`);
      const data = (await response.json().catch(() => null)) as
        | { content: string; error?: string }
        | null;

      if (!response.ok || !data?.content) {
        setStatusMessage(data?.error || "Failed to load log");
        return;
      }

      setSelectedLog(entry);
      setLogContent(data.content);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to load log");
    }
  }

  async function disconnectX(): Promise<void> {
    try {
      const response = await fetch("/api/x/oauth/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: xSelectedAccountId || null
        })
      });
      if (!response.ok) {
        setStatusMessage("Failed to disconnect X");
        return;
      }

      setStatusMessage("X disconnected.");
      await loadXAuthStatus();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to disconnect X");
    }
  }

  async function saveXAccountMetadata(): Promise<void> {
    if (!xSelectedAccountId) {
      setStatusMessage("Choose an X account first.");
      return;
    }

    try {
      const response = await fetch("/api/x/oauth/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: xSelectedAccountId,
          username: xConnectUsername.trim() || null,
          userId: xConnectUserId.trim() || null,
          label: xConnectLabel.trim() || null,
          makeActive: true
        })
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setStatusMessage(data?.error || "Failed to save X account metadata");
        return;
      }

      setStatusMessage("X account metadata saved.");
      await loadXAuthStatus();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to save X account metadata");
    }
  }

  async function setActiveXAccountSelection(accountId: string): Promise<void> {
    setXSelectedAccountId(accountId);
    const selectedAccount = xAuthStatus?.accounts?.find((account) => account.accountId === accountId) ?? null;
    setXConnectUsername(selectedAccount?.username ?? "");
    setXConnectUserId(selectedAccount?.userId ?? "");
    setXConnectLabel(selectedAccount?.label ?? "");

    try {
      const response = await fetch("/api/x/oauth/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId })
      });
      if (!response.ok) {
        setStatusMessage("Failed to switch active X account");
        return;
      }
      await loadXAuthStatus();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to switch active X account");
    }
  }

  return (
    <section id="run-control" className="relative z-10 mb-8 terminal-panel">
      <div className="panel-body">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="section-kicker">Capture and runs</div>
            <h2 className="section-title mt-3">Run captures, maintenance jobs, and the scheduler</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              Start a job, manage your X account, and inspect recent failures without leaving this workspace.
            </p>
          </div>
          <div className={`tt-chip ${enabled ? "tt-chip-accent" : ""}`}>
            {enabled
              ? `${schedulerConfig.times.length} daily slot${schedulerConfig.times.length === 1 ? "" : "s"}`
              : "disabled"}
          </div>
        </div>

        {xAuthWarning ? (
          <div className="mb-6 tt-subpanel border-orange/60 bg-orange/10">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="tt-chip tt-chip-danger">X connection needs attention</div>
                <p className="mt-3 text-sm leading-6 text-slate-100">{xAuthWarning.reason}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                  {xAuthWarning.task} failed {formatDate(xAuthWarning.startedAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button className="tt-button" onClick={startXOauthFlow} disabled={isPending || xAuthStatus?.configured === false}>
                  <span>Reconnect X</span>
                </button>
                <button className="tt-button tt-button-secondary" onClick={() => startTransition(() => void loadXAuthStatus())} disabled={isPending}>
                  <span>Recheck Status</span>
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mb-6 grid gap-3 lg:grid-cols-3">
          <div className="tt-lead-card">
            <div className="tt-data-label">Start here</div>
            <p className="mt-3 text-base leading-7 text-slate-100">
              {xAuthWarning
                ? "Reconnect X, then run a fresh capture."
                : "Run a capture first. Use refresh jobs after new data lands."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="tt-chip tt-chip-accent">{groupedActions[0]?.actions.length ?? 0} capture actions</span>
              <span className="tt-chip">{groupedActions[1]?.actions.length ?? 0} refresh jobs</span>
            </div>
          </div>
          <div className="tt-subpanel-soft">
            <div className="tt-data-label">X access</div>
            <p className="mt-3 text-sm leading-6 text-slate-200">
              {xAuthStatus == null
                ? "Checking account status."
                : xAuthStatus.connected
                  ? `Connected${xAuthStatus.auth?.username ? ` as @${xAuthStatus.auth.username}` : ""}.`
                  : xAuthStatus.configured
                    ? "Configured, but not connected."
                    : `Missing ${xAuthStatus.missing.join(", ")}.`}
            </p>
            {xAuthStatus?.auth?.expiresAt ? (
              <div className="mt-3 text-xs uppercase tracking-[0.14em] text-slate-400">expires {formatDate(xAuthStatus.auth.expiresAt)}</div>
            ) : null}
          </div>
          <div className="tt-subpanel-soft">
            <div className="tt-data-label">Pipeline health</div>
            <p className="mt-3 text-sm leading-6 text-slate-200">
              {activeRuns.length > 0
                ? `${activeRuns[0]?.task} is still running.`
                : latestFailure
                  ? `${latestFailure.task} failed ${formatDate(latestFailure.startedAt)}.`
                  : "No recent failures in this history slice."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`tt-chip ${enabled ? "tt-chip-accent" : ""}`}>{enabled ? "schedule on" : "schedule off"}</span>
              <span className={`tt-chip ${activeRuns.length > 0 ? "tt-chip-accent" : ""}`}>{activeRuns.length} running</span>
              <span className={`tt-chip ${recentFailures.length > 0 ? "tt-chip-danger" : ""}`}>{recentFailures.length} failures</span>
            </div>
          </div>
        </div>

        {activeRuns.length > 0 ? (
          <div className="mb-6 tt-subpanel border-accent/50 bg-accent/10">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="tt-chip tt-chip-accent">Background work running</div>
                <p className="mt-3 text-sm leading-6 text-slate-100">
                  Fresh captures can show pending items until the follow-up jobs finish writing analysis and topic data.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {activeRuns.slice(0, 4).map((entry) => (
                  <span key={entry.runControlId} className="tt-chip">
                    {entry.task} · {formatDate(entry.startedAt)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="terminal-window">
            <div className="window-bar">
              <div className="section-kicker">Primary actions</div>
              <div className="window-dots">
                <span className="window-dot bg-orange" />
                <span className="window-dot bg-accent" />
                <span className="window-dot bg-cyan" />
              </div>
            </div>
            <div className="panel-body space-y-4">
              <details id="x-auth" className="tt-disclosure scroll-mt-28" open={Boolean(xAuthWarning) || !xAuthStatus?.connected}>
                <summary>
                  <span>X account setup and switching</span>
                  <span className="tt-chip">{xAuthStatus?.connected ? "connected" : "needs setup"}</span>
                </summary>
                <div className="tt-disclosure-body space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="tt-copy">
                        X account:{" "}
                        {xAuthStatus == null
                          ? "checking"
                          : xAuthStatus.connected
                            ? `connected${xAuthStatus.auth?.label ? ` as ${xAuthStatus.auth.label}` : xAuthStatus.auth?.username ? ` as @${xAuthStatus.auth.username}` : ""}`
                            : xAuthStatus.configured
                              ? "not connected"
                              : `missing ${xAuthStatus.missing.join(", ")}`}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        Pick the X account you want to capture with. Save the username and numeric user id once, then switch accounts here when needed.
                      </p>
                      {xAuthStatus?.auth?.expiresAt ? (
                        <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                          expires {formatDate(xAuthStatus.auth.expiresAt)}
                        </p>
                      ) : null}
                      {xAuthStatus?.redirectUri ? (
                        <p className="mt-2 text-xs leading-6 text-slate-400">callback {xAuthStatus.redirectUri}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button
                        className="tt-button"
                        onClick={startXOauthFlow}
                        disabled={isPending || xAuthStatus?.configured === false}
                      >
                        <span>{xAuthStatus?.connected ? "Connect another X account" : "Connect X"}</span>
                      </button>
                      <button
                        className="tt-button tt-button-secondary"
                        onClick={() => startTransition(() => void loadXAuthStatus())}
                        disabled={isPending}
                      >
                        <span>Refresh X status</span>
                      </button>
                      {xAuthStatus?.connected ? (
                        <button
                          className="tt-button tt-button-secondary"
                          onClick={() => startTransition(() => void disconnectX())}
                          disabled={isPending}
                        >
                          <span>Disconnect selected account</span>
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <label className="tt-field">
                    <span className="tt-field-label">Connected account</span>
                    <select
                      value={xSelectedAccountId}
                      onChange={(event) => {
                        void setActiveXAccountSelection(event.target.value);
                      }}
                      className="tt-select"
                    >
                      {(xAuthStatus?.accounts?.length ?? 0) === 0 ? (
                        <option value="">No connected accounts</option>
                      ) : (
                        (xAuthStatus?.accounts ?? []).map((account) => (
                          <option key={account.accountId} value={account.accountId}>
                            {account.label ?? account.username ?? account.userId ?? account.accountId}
                          </option>
                        ))
                      )}
                    </select>
                  </label>

                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="tt-field">
                      <span className="tt-field-label">Username</span>
                      <input
                        type="text"
                        value={xConnectUsername}
                        onChange={(event) => setXConnectUsername(event.target.value)}
                        placeholder="Nick_Locascio_"
                        className="tt-input"
                      />
                    </label>
                    <label className="tt-field">
                      <span className="tt-field-label">User ID</span>
                      <input
                        type="text"
                        value={xConnectUserId}
                        onChange={(event) => setXConnectUserId(event.target.value)}
                        placeholder="29588111"
                        className="tt-input"
                      />
                    </label>
                    <label className="tt-field">
                      <span className="tt-field-label">Label</span>
                      <input
                        type="text"
                        value={xConnectLabel}
                        onChange={(event) => setXConnectLabel(event.target.value)}
                        placeholder="@Nick_Locascio_"
                        className="tt-input"
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      className="tt-button tt-button-secondary"
                      onClick={() => startTransition(() => void saveXAccountMetadata())}
                      disabled={isPending || !xSelectedAccountId}
                    >
                      <span>Save Account Metadata</span>
                    </button>
                  </div>
                </div>
              </details>

              <label className="tt-field">
                <span className="tt-field-label">Tweet URL (optional)</span>
                <input
                  type="text"
                  value={xStatusUrl}
                  onChange={(event) => setXStatusUrl(event.target.value)}
                  placeholder="https://x.com/user/status/1234567890"
                  className="tt-input"
                />
              </label>

              <div className="surface-divider pt-4">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <div className="tt-data-label">Jobs</div>
                    <p className="mt-2 text-sm leading-6 text-slate-300">Start with a capture. Use the rest for refresh, repair, and analysis.</p>
                  </div>
                  {isPending ? <span className="tt-chip tt-chip-accent">working</span> : null}
                </div>
                <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,220px)_1fr]">
                  <label className="tt-field">
                    <span className="tt-field-label">Topic batch size</span>
                    <select
                      value={topicBatchLimit}
                      onChange={(event) => setTopicBatchLimit(event.target.value)}
                      className="tt-select"
                    >
                      <option value="25">25 tweets</option>
                      <option value="50">50 tweets</option>
                      <option value="100">100 tweets</option>
                      <option value="200">200 tweets</option>
                    </select>
                  </label>
                  <div className="tt-subpanel-soft">
                    <p className="text-sm leading-6 text-slate-300">
                      Only used by <strong className="text-slate-100">Refresh topics</strong>. Runs stay single-threaded and respect the repo delay setting.
                    </p>
                  </div>
                </div>
                <div className="grid gap-5">
                  {groupedActions.map((group) => (
                    <section key={group.title} className="space-y-3">
                      <div>
                        <div className="tt-data-label">{group.title}</div>
                        <p className="mt-2 text-sm leading-6 text-slate-300">{group.description}</p>
                      </div>
                      <div className="control-action-grid">
                        {group.actions.map((action) => (
                          <article key={action.task} className="action-tile">
                            <div>
                              <h3 className="text-base font-semibold text-slate-100">{action.title}</h3>
                              <p className="mt-2 text-sm leading-6 text-slate-300">{action.description}</p>
                            </div>
                            <button
                              className={action.tone === "primary" ? "tt-button" : "tt-button tt-button-secondary"}
                              onClick={() => startTransition(() => void triggerRun(action.task))}
                              disabled={isPending}
                            >
                              <span>{action.title}</span>
                            </button>
                          </article>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>

              <div className="tt-subpanel">
                <p className="tt-copy">
                  Timeline captures use the connected X account above. Tweet capture actions use the optional tweet URL field.
                </p>
              </div>
            </div>
          </div>

          <div className="terminal-window">
            <div className="window-bar">
              <div className="section-kicker">Schedule</div>
              <div className="tt-chip">{schedulerConfig.timezone}</div>
            </div>
            <div className="panel-body space-y-4">
              <label className="tt-field">
                <span className="tt-field-label">Enabled</span>
                <div className="tt-subpanel-soft flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) => setEnabled(event.target.checked)}
                    className="tt-checkbox"
                  />
                  <span className="font-[family:var(--font-label)] text-xs uppercase tracking-[0.22em] text-slate-200">
                    Run captures on a schedule
                  </span>
                </div>
              </label>
              <label className="tt-field">
                <span className="tt-field-label">Daily times</span>
                <input
                  type="text"
                  value={timesValue}
                  onChange={(event) => setTimesValue(event.target.value)}
                  placeholder="09:00, 13:00, 17:00"
                  className="tt-input"
                />
              </label>
              <label className="tt-field">
                <span className="tt-field-label">Timezone</span>
                <input
                  type="text"
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                  className="tt-input"
                />
              </label>
              <div className="tt-subpanel">
                <p className="tt-copy">
                  Enter comma-separated local times like `09:00, 13:00, 17:00`. Run `npm run scheduler` to start polling. Missed slots are picked up on the next evaluation.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button className="tt-button" onClick={() => startTransition(() => void saveSchedule())} disabled={isPending}>
                  <span>Save schedule</span>
                </button>
                <span className="tt-chip">{schedulerConfig.timezone}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="tt-chip">last evaluated {formatDate(schedulerConfig.lastEvaluatedAt)}</span>
          <span className="tt-chip">last processed slot {formatDate(schedulerConfig.lastProcessedSlotAt)}</span>
          <span className="tt-chip">last triggered {formatDate(schedulerConfig.lastTriggeredAt)}</span>
          {schedulerConfig.lastSkipReason ? (
            <span className="tt-chip tt-chip-danger" title={schedulerConfig.lastSkipReason}>
              skipped {formatDate(schedulerConfig.lastSkippedAt)}
            </span>
          ) : null}
          {statusMessage ? <span className="tt-chip tt-chip-accent">{statusMessage}</span> : null}
        </div>

        <div className="mt-6 space-y-4">
          <details className="tt-disclosure" open={Boolean(selectedLog)}>
            <summary>
              <span>Recent runs and logs</span>
              <span className="tt-chip">{runHistory.length} events</span>
            </summary>
            <div className="tt-disclosure-body">
              <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                <div className="terminal-window">
                  <div className="window-bar">
                    <div className="section-kicker">Recent runs</div>
                    <div className="tt-chip">{recentFailures.length} failures</div>
                  </div>
                  <div className="panel-body tt-scroll-panel">
                    <div className="grid gap-3">
                      {runHistory.length === 0 ? (
                        <div className="tt-placeholder">No recorded runs yet.</div>
                      ) : (
                        runHistory.map((entry) => (
                          <button
                            key={entry.runControlId}
                            className="tt-subpanel cursor-pointer text-left transition-[transform,border-color,box-shadow] duration-150 ease-linear hover:-translate-y-0.5 hover:border-accent/70 hover:shadow-[0_0_4px_#00ff88,0_0_12px_rgba(0,255,136,0.16)]"
                            onClick={() => startTransition(() => void loadLog(entry))}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <strong className="font-[family:var(--font-label)] text-xs uppercase tracking-[0.24em] text-accent">
                                  {entry.task}
                                </strong>
                                <div className="mt-2 text-sm text-slate-200">{entry.trigger}</div>
                              </div>
                              <span
                                className={`tt-chip ${
                                  entry.status === "failed" ? "tt-chip-danger" : entry.status === "running" ? "tt-chip-accent" : ""
                                }`}
                              >
                                {entry.status}
                              </span>
                            </div>
                            <div className="mt-2 text-sm text-slate-300">
                              {entry.trigger} · {formatDate(entry.startedAt)}
                            </div>
                            {entry.errorMessage ? <div className="mt-3 text-sm text-red-300">{entry.errorMessage}</div> : null}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="terminal-window">
                  <div className="window-bar">
                    <div className="section-kicker">Run log</div>
                    {selectedLog ? <div className="tt-chip">{selectedLog.runControlId}</div> : null}
                  </div>
                  <div className="panel-body tt-scroll-panel">
                    {selectedLog ? (
                      <div className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                          <span className="tt-chip">{selectedLog.logPath}</span>
                          <span
                            className={`tt-chip ${
                              selectedLog.status === "failed" ? "tt-chip-danger" : selectedLog.status === "running" ? "tt-chip-accent" : ""
                            }`}
                          >
                            {selectedLog.status}
                          </span>
                        </div>
                        <pre className="tt-log">{logContent || "log is empty"}</pre>
                      </div>
                    ) : (
                      <div className="tt-placeholder">Pick a run to view its output and errors.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </details>

          {recentFailures.length > 0 ? (
            <details className="tt-disclosure">
              <summary>
                <span>Failure summary</span>
                <span className="tt-chip tt-chip-danger">{recentFailures.length} recent failures</span>
              </summary>
              <div className="tt-disclosure-body">
                <div className="flex flex-wrap gap-2">
                  {recentFailures.slice(0, 8).map((entry) => (
                    <span key={entry.runControlId} className="tt-chip tt-chip-danger">
                      {entry.task} · {formatDate(entry.startedAt)}
                    </span>
                  ))}
                </div>
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </section>
  );
}
