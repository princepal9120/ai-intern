"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Bot,
  GitPullRequest,
  MessageSquare,
  Zap,
  Shield,
  BarChart3,
  Check,
  Terminal,
  Database,
  Cpu,
  Play,
} from "lucide-react";

const Github = Bot;
const Slack = MessageSquare;

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

export default function LandingPage() {
  const [copied, setCopied] = useState(false);
  const [activeAgent, setActiveAgent] = useState(0);

  const installCmd = "git clone https://github.com/princepal9120/ai-intern.git && cd ai-intern && docker compose up -d";

  const copyInstall = () => {
    navigator.clipboard.writeText(installCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const agents = [
    { name: "Claude Code", best: "Complex tasks", cost: "$$$", color: "bg-orange-500" },
    { name: "Codex", best: "Medium features", cost: "$$", color: "bg-green-500" },
    { name: "Cursor", best: "UI work", cost: "$$", color: "bg-blue-500" },
    { name: "OpenCode", best: "Cheap, multi-model", cost: "$", color: "bg-purple-500" },
    { name: "Grok", best: "xAI integration", cost: "$$", color: "bg-cyan-500" },
    { name: "Aider", best: "Quick fixes", cost: "$", color: "bg-yellow-500" },
    { name: "Ollama", best: "Local, private", cost: "$0", color: "bg-pink-500" },
  ];

  const phases = [
    { step: 1, title: "Invocation", desc: "@anant-intern PROJ-123 in Slack", icon: MessageSquare },
    { step: 2, title: "Context", desc: "Fetch Jira ticket, identify repo and files", icon: Database },
    { step: 3, title: "Plan", desc: "Create GitHub Gist with implementation plan", icon: GitPullRequest },
    { step: 4, title: "Approval", desc: "✅ approve or ❌ reject in Slack", icon: Shield },
    { step: 5, title: "Execute", desc: "Run agent in sandboxed git worktree", icon: Terminal },
    { step: 6, title: "Verify", desc: "Run tests + lint, capture output", icon: Check },
    { step: 7, title: "Wrap-up", desc: "Create PR, update Jira, post summary", icon: Zap },
  ];

  const metrics = [
    { label: "Tickets Cleared", value: "200+", sub: "in first month" },
    { label: "Cost per Ticket", value: "$1.50", sub: "vs $150 senior engineer" },
    { label: "Time to PR", value: "2.4h", sub: "average" },
    { label: "PR Merge Rate", value: "78%", sub: "first-pass approval" },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-6 h-6 text-emerald-400" />
            <span className="font-bold text-lg">Anant Intern</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-400">
            <a href="#features" className="hover:text-white transition">Features</a>
            <a href="#architecture" className="hover:text-white transition">Architecture</a>
            <a href="#agents" className="hover:text-white transition">Agents</a>
            <a href="#metrics" className="hover:text-white transition">Metrics</a>
            <a href="#demo" className="hover:text-white transition">Demo</a>
          </div>
          <a
            href="https://github.com/princepal9120/ai-intern"
            className="flex items-center gap-2 bg-white text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition"
          >
            <Github className="w-4 h-4" />
            GitHub
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <motion.div initial="hidden" animate="visible" variants={stagger}>
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 text-emerald-400 text-sm mb-8">
              <Zap className="w-4 h-4" />
              Vercel OSS Labs Applicant — MIT License
            </motion.div>

            <motion.h1 variants={fadeUp} className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
              Your AI Intern.
              <br />
              <span className="text-emerald-400">In Your Slack.</span>
            </motion.h1>

            <motion.p variants={fadeUp} className="text-xl text-gray-400 max-w-2xl mx-auto mb-10">
              Tag it like a colleague. Assign it Jira tickets. It plans, codes, tests, and opens PRs — with full approval gates. Multi-agent. Evidence-backed. Plug and play.
            </motion.p>

            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
              <button onClick={copyInstall} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-black font-medium px-6 py-3 rounded-lg transition">
                {copied ? <Check className="w-4 h-4" /> : <Terminal className="w-4 h-4" />}
                {copied ? "Copied!" : "Clone & Run"}
              </button>
              <a href="#demo" className="flex items-center gap-2 border border-white/20 hover:border-white/40 px-6 py-3 rounded-lg transition">
                <Play className="w-4 h-4" />
                Watch Demo
              </a>
            </motion.div>

            <motion.div variants={fadeUp} className="bg-gray-900 border border-white/10 rounded-xl p-4 max-w-xl mx-auto">
              <code className="text-sm text-gray-300">
                <span className="text-gray-500">$</span> {installCmd}
              </code>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Metrics */}
      <section id="metrics" className="py-16 px-6 border-y border-white/10">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {metrics.map((m, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-emerald-400 mb-1">{m.value}</div>
              <div className="text-sm text-gray-400">{m.label}</div>
              <div className="text-xs text-gray-600">{m.sub}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="text-center mb-16">
            <motion.h2 variants={fadeUp} className="text-4xl font-bold mb-4">Everything You Need. Nothing You Don&apos;t.</motion.h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: MessageSquare, title: "Slack-Native", desc: "Tag @anant-intern in any channel. It acknowledges, plans, and reports back." },
              { icon: GitPullRequest, title: "Evidence-Backed PRs", desc: "Every PR includes a plan Gist, test output, lint results, and before/after screenshots." },
              { icon: Shield, title: "Approval-Gated", desc: "Agent proposes, you approve. Never touches production without explicit ✅." },
              { icon: Cpu, title: "Multi-Agent", desc: "Claude Code, Codex, Cursor, OpenCode, Grok, Aider, Ollama — smart routing chooses." },
              { icon: Database, title: "Plug and Play", desc: "Docker compose, setup wizard, web dashboard. No code changes." },
              { icon: BarChart3, title: "Metrics That Matter", desc: "Tickets cleared, cost per task, time to PR, merge rate." },
            ].map((f, i) => (
              <motion.div key={i} variants={fadeUp} className="bg-gray-900 border border-white/10 rounded-xl p-6 hover:border-emerald-500/50 transition">
                <f.icon className="w-8 h-8 text-emerald-400 mb-4" />
                <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                <p className="text-gray-400 text-sm">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture */}
      <section id="architecture" className="py-20 px-6 bg-gray-950">
        <div className="max-w-7xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="text-center mb-16">
            <motion.h2 variants={fadeUp} className="text-4xl font-bold mb-4">7 Phases. One Thread.</motion.h2>
            <motion.p variants={fadeUp} className="text-gray-400">From invocation to merged PR — fully autonomous, fully observable.</motion.p>
          </motion.div>

          <div className="max-w-3xl mx-auto">
            {phases.map((p, i) => (
              <motion.div key={i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="flex items-start gap-4 mb-6 last:mb-0">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-sm">{p.step}</div>
                <div className="flex-1 bg-gray-900 border border-white/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <p.icon className="w-4 h-4 text-emerald-400" />
                    <span className="font-medium">{p.title}</span>
                  </div>
                  <p className="text-sm text-gray-400">{p.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Agents */}
      <section id="agents" className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="text-center mb-16">
            <motion.h2 variants={fadeUp} className="text-4xl font-bold mb-4">7 Agents. Pick One or Let Us Route.</motion.h2>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-12">
            {agents.map((a, i) => (
              <button key={i} onClick={() => setActiveAgent(i)} className={`p-4 rounded-xl border text-center transition ${activeAgent === i ? "border-emerald-500 bg-emerald-500/10" : "border-white/10 bg-gray-900 hover:border-white/30"}`}>
                <div className={`w-3 h-3 rounded-full ${a.color} mx-auto mb-2`} />
                <div className="font-medium text-sm">{a.name}</div>
                <div className="text-xs text-gray-500">{a.cost}</div>
              </button>
            ))}
          </div>

          <motion.div key={activeAgent} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-gray-900 border border-white/10 rounded-xl p-8 max-w-2xl mx-auto text-center">
            <div className={`w-16 h-16 rounded-2xl ${agents[activeAgent].color} mx-auto mb-4 flex items-center justify-center`}>
              <Cpu className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-2xl font-bold mb-2">{agents[activeAgent].name}</h3>
            <p className="text-gray-400 mb-4">Best for: {agents[activeAgent].best}</p>
            <div className="inline-flex items-center gap-2 bg-gray-800 rounded-lg px-4 py-2">
              <span className="text-sm text-gray-400">Cost:</span>
              <span className="font-mono font-bold text-emerald-400">{agents[activeAgent].cost}</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Demo */}
      <section id="demo" className="py-20 px-6 bg-gray-950">
        <div className="max-w-7xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="text-center mb-16">
            <motion.h2 variants={fadeUp} className="text-4xl font-bold mb-4">See It In Action</motion.h2>
          </motion.div>

          <div className="max-w-4xl mx-auto">
            <div className="bg-gray-900 border border-white/10 rounded-xl overflow-hidden">
              <div className="bg-gray-800 px-4 py-3 border-b border-white/10 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="ml-2 text-sm text-gray-400">#engineering</span>
              </div>

              <div className="p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded bg-blue-500 flex items-center justify-center text-xs font-bold">U</div>
                  <div>
                    <div className="text-sm font-medium mb-1">You</div>
                    <div className="bg-gray-800 rounded-lg px-4 py-2 text-sm">@anant-intern BIK-142: Fix payment gateway logos</div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded bg-emerald-500 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium mb-1 text-emerald-400">Anant Intern</div>
                    <div className="bg-gray-800 rounded-lg px-4 py-3 text-sm space-y-2">
                      <p>🎓 Working on <code className="bg-gray-700 px-1 rounded">BIK-142</code></p>
                      <p>🔍 Context gathered: Repo <code className="bg-gray-700 px-1 rounded">bikayi/frontend</code>, 3 files</p>
                      <p>📝 Plan ready: <a href="#" className="text-blue-400 underline">gist.github.com/abc123</a></p>
                      <p>Reply <span className="text-emerald-400">✅ approve</span> to proceed</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded bg-blue-500 flex items-center justify-center text-xs font-bold">U</div>
                  <div>
                    <div className="text-sm font-medium mb-1">You</div>
                    <div className="bg-gray-800 rounded-lg px-4 py-2 text-sm">✅ approve</div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded bg-emerald-500 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium mb-1 text-emerald-400">Anant Intern</div>
                    <div className="bg-gray-800 rounded-lg px-4 py-3 text-sm space-y-2">
                      <p>⚡ Executing...</p>
                      <p className="text-emerald-400 font-medium">✅ Done!</p>
                      <p>🔀 PR: <a href="#" className="text-blue-400 underline">github.com/bikayi/frontend/pull/456</a></p>
                      <p>🧪 Tests: ✅ | Lint: ✅</p>
                      <p>⏱️ 4m 23s | 💰 $0.82</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.h2 variants={fadeUp} className="text-4xl font-bold mb-4">Built for Vercel OSS Labs</motion.h2>
            <motion.p variants={fadeUp} className="text-gray-400 mb-12">Modern stack. Production-ready.</motion.p>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
            {[
              { name: "Next.js 15", desc: "Dashboard UI" },
              { name: "FastAPI", desc: "API Server" },
              { name: "PostgreSQL", desc: "Metrics Store" },
              { name: "Redis", desc: "Job Queue" },
              { name: "Celery", desc: "Worker Pool" },
              { name: "Docker", desc: "Deployment" },
              { name: "CrewAI", desc: "Multi-Agent" },
              { name: "Slack Bolt", desc: "Bot Framework" },
            ].map((t, i) => (
              <motion.div key={i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="bg-gray-900 border border-white/10 rounded-xl p-4">
                <div className="font-medium text-sm">{t.name}</div>
                <div className="text-xs text-gray-500">{t.desc}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-emerald-500/5 border-y border-emerald-500/20">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.h2 variants={fadeUp} className="text-4xl font-bold mb-4">Ready to Clear Your Backlog?</motion.h2>
            <motion.p variants={fadeUp} className="text-gray-400 mb-8">Clone, configure, and have your first PR open in under 10 minutes.</motion.p>
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button onClick={copyInstall} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-black font-medium px-8 py-4 rounded-xl transition text-lg">
                <Terminal className="w-5 h-5" />
                Get Started
              </button>
              <a href="https://github.com/princepal9120/ai-intern" className="flex items-center gap-2 border border-white/20 hover:border-white/40 px-8 py-4 rounded-xl transition text-lg">
                <Github className="w-5 h-5" />
                View Source
              </a>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-emerald-400" />
            <span className="font-medium">Anant Intern</span>
            <span className="text-gray-600 text-sm">— MIT License</span>
          </div>
          <div className="text-sm text-gray-500">
            Built by <a href="https://github.com/princepal9120" className="text-emerald-400 hover:underline">@princepal9120</a> for Vercel OSS Labs
          </div>
        </div>
      </footer>
    </div>
  );
}
