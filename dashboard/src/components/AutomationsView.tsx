import { useState, type JSX } from "react";

export function AutomationsView(): JSX.Element {
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedEndpoint(label);
    setTimeout(() => setCopiedEndpoint(null), 2000);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-black text-[#e6edf3] p-4 lg:p-8">
      <div className="max-w-5xl mx-auto w-full flex flex-col gap-6">
        {/* Header */}
        <div className="border-b border-neutral-800 pb-4">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <span>Automations & Inbound Triggers</span>
            <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-teal-950/60 border border-teal-800/60 text-teal-400">
              Autonomous
            </span>
          </h2>
          <p className="text-xs text-[#8b98a9]">
            AI Intern triggers tasks automatically from GitHub webhooks, Slack channels, and scheduled cron ticks.
          </p>
        </div>

        {/* Integration Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* GitHub Webhook */}
          <div className="border border-neutral-800 rounded-xl bg-[#090b0e] p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-sm text-white">
                <svg className="w-5 h-5 text-teal-400" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
                <span>GitHub Webhooks</span>
              </div>
              <span className="text-[10px] font-mono uppercase bg-[#4cc38a]/15 text-[#4cc38a] border border-[#4cc38a]/30 px-2 py-0.5 rounded-full">
                Signature Verified
              </span>
            </div>

            <p className="text-xs text-[#8b98a9] leading-relaxed">
              Receives repo events (issues, PRs, comments) and automatically dispatches coding jobs to sandboxes.
            </p>

            <div className="bg-black p-2.5 rounded-lg border border-neutral-800 flex items-center justify-between text-xs font-mono">
              <span className="text-[#e6edf3] truncate">/api/github/webhook</span>
              <button
                type="button"
                onClick={() => copyToClipboard("/api/github/webhook", "github")}
                className="text-teal-400 hover:text-teal-300 text-[11px] shrink-0 ml-2"
              >
                {copiedEndpoint === "github" ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="text-[11px] font-mono text-[#8b98a9]">
              Secret: <span className="text-white">GITHUB_WEBHOOK_SECRET</span> (HMAC-SHA256)
            </div>
          </div>

          {/* Slack Integration */}
          <div className="border border-neutral-800 rounded-xl bg-[#090b0e] p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-sm text-white">
                <svg className="w-5 h-5 text-teal-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
                </svg>
                <span>Slack Bot & Interactive Gates</span>
              </div>
              <span className="text-[10px] font-mono uppercase bg-teal-950/60 text-teal-400 border border-teal-800/60 px-2 py-0.5 rounded-full">
                Interactive
              </span>
            </div>

            <p className="text-xs text-[#8b98a9] leading-relaxed">
              Mention <code className="text-white">@intern</code> or run <code className="text-white">/intern</code>. Approvals are posted as interactive Slack Block Kit cards.
            </p>

            <div className="flex flex-col gap-1.5 text-xs font-mono">
              <div className="bg-black p-2 rounded border border-neutral-800 flex items-center justify-between">
                <span>Commands: /api/slack/command</span>
                <button type="button" onClick={() => copyToClipboard("/api/slack/command", "slack1")} className="text-teal-400 text-[11px]">
                  {copiedEndpoint === "slack1" ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="bg-black p-2 rounded border border-neutral-800 flex items-center justify-between">
                <span>Events: /api/slack/events</span>
                <button type="button" onClick={() => copyToClipboard("/api/slack/events", "slack2")} className="text-teal-400 text-[11px]">
                  {copiedEndpoint === "slack2" ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="bg-black p-2 rounded border border-neutral-800 flex items-center justify-between">
                <span>Interactivity: /api/slack/interact</span>
                <button type="button" onClick={() => copyToClipboard("/api/slack/interact", "slack3")} className="text-teal-400 text-[11px]">
                  {copiedEndpoint === "slack3" ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Automations DO Engine */}
        <div className="border border-neutral-800 rounded-xl bg-[#090b0e] p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <svg className="w-4 h-4 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Automations Durable Object Engine</span>
            </h3>
            <span className="text-[11px] font-mono text-[#4cc38a]">Active & Bound</span>
          </div>

          <p className="text-xs text-[#8b98a9] leading-relaxed">
            The Automations Durable Object maintains scheduled task timers, processes incoming event fan-outs, and triggers automated coding workflows with full telemetry and replay receipts.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">
            <div className="bg-black p-3 rounded-lg border border-neutral-800 flex flex-col gap-1">
              <span className="text-[#8b98a9] text-[11px]">Cron Scheduler</span>
              <span className="text-white font-semibold">Hourly Health Tick</span>
            </div>
            <div className="bg-black p-3 rounded-lg border border-neutral-800 flex flex-col gap-1">
              <span className="text-[#8b98a9] text-[11px]">Evaluation Model</span>
              <span className="text-white font-semibold">TypeSafe System One / Llama</span>
            </div>
            <div className="bg-black p-3 rounded-lg border border-neutral-800 flex flex-col gap-1">
              <span className="text-[#8b98a9] text-[11px]">Run Capacity</span>
              <span className="text-white font-semibold">5 Concurrent Sandboxes</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

