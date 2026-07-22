"use client";

import { useChat } from "@ai-sdk/react";
import { useTriggerChatTransport } from "@trigger.dev/sdk/chat/react";
import { FormEvent, useMemo, useState } from "react";
import { mintChatAccessToken, startChatSession } from "./actions";
import { buildIncidentBoard } from "../src/lib/investigation";
import type { IncidentBoard } from "../src/lib/types";
import type { ServiceName } from "../src/lib/types";
import type { incidentAgent } from "../trigger/incident-agent";

export default function Home() {
  const [submitted, setSubmitted] = useState(false);
  const [question, setQuestion] = useState("Why did checkout latency spike after the 14:32 deploy?");
  const [selectedService, setSelectedService] = useState<ServiceName | "all">("all");
  const [openEvidence, setOpenEvidence] = useState<string | null>("timeline");
  const fixtureBoard = useMemo(() => buildIncidentBoard(), []);
  const liveMode = process.env.NEXT_PUBLIC_TRIGGER_CHAT_ENABLED === "true";
  const transport = useTriggerChatTransport<typeof incidentAgent>({
    task: "incident-agent",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) => startChatSession({ chatId, clientData })
  });
  const { messages, sendMessage, status, error } = useChat({ transport });
  const board = useMemo(
    () => (liveMode ? mergeStreamedBoard(fixtureBoard, messages as unknown[]) : fixtureBoard),
    [fixtureBoard, liveMode, messages]
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (liveMode) {
      void sendMessage({ text: question });
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Clickfuse</p>
          <h1>Why was checkout slow?</h1>
          <p className="lede">
            A chat agent that builds an evidence-backed root-cause proof board from ClickHouse data,
            orchestrated by Trigger.dev.
          </p>
        </div>
        <div className="badge">Beyond the Wall of Text</div>
      </section>

      <form className="prompt" onSubmit={submit}>
        <input
          aria-label="Incident question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <button type="submit">{liveMode ? "Run live agent" : "Render fixture board"}</button>
      </form>
      <p className={liveMode ? "agent-status live" : "agent-status"}>
        {liveMode
          ? `Live Trigger.dev mode enabled · ${status}${error ? ` · ${error.message}` : ""}`
          : "Offline fixture mode enabled · set NEXT_PUBLIC_TRIGGER_CHAT_ENABLED=true for live Trigger.dev streaming."}
      </p>

      {!submitted ? (
        <BoardSkeleton />
      ) : (
        <IncidentBoard
          board={board}
          selectedService={selectedService}
          setSelectedService={setSelectedService}
          openEvidence={openEvidence}
          setOpenEvidence={setOpenEvidence}
        />
      )}
    </main>
  );
}

function mergeStreamedBoard(fixture: IncidentBoard, messages: unknown[]): IncidentBoard {
  const board: IncidentBoard = structuredClone(fixture);
  for (const message of messages) {
    const parts = getMessageParts(message);
    for (const part of parts) {
      if (!isDataPart(part)) continue;
      if (part.type === "data-timeline") board.timeline = part.data as IncidentBoard["timeline"];
      if (part.type === "data-heatmap") board.heatmap = part.data as IncidentBoard["heatmap"];
      if (part.type === "data-diff") board.diff = part.data as IncidentBoard["diff"];
      if (part.type === "data-suspect") board.suspects = part.data as IncidentBoard["suspects"];
      if (part.type === "data-error-budget") board.errorBudget = part.data as IncidentBoard["errorBudget"];
      if (part.type === "data-verdict") board.verdict = part.data as IncidentBoard["verdict"];
    }
  }
  return board;
}

function getMessageParts(message: unknown): unknown[] {
  if (message && typeof message === "object" && "parts" in message && Array.isArray(message.parts)) {
    return message.parts;
  }
  return [];
}

function isDataPart(part: unknown): part is { type: string; data: unknown } {
  return Boolean(
    part &&
      typeof part === "object" &&
      "type" in part &&
      typeof part.type === "string" &&
      part.type.startsWith("data-") &&
      "data" in part
  );
}

function BoardSkeleton() {
  return (
    <section className="board skeleton-board" aria-label="Incident proof board skeleton">
      <div className="card wide skeleton-card" />
      <div className="card skeleton-card" />
      <div className="card skeleton-card" />
      <div className="card skeleton-card" />
      <div className="card skeleton-card" />
      <div className="card wide skeleton-card small" />
    </section>
  );
}

function IncidentBoard({
  board,
  selectedService,
  setSelectedService,
  openEvidence,
  setOpenEvidence
}: {
  board: ReturnType<typeof buildIncidentBoard>;
  selectedService: ServiceName | "all";
  setSelectedService: (service: ServiceName | "all") => void;
  openEvidence: string | null;
  setOpenEvidence: (id: string | null) => void;
}) {
  const selected = selectedService === "all" ? null : selectedService;
  const timeline = selected ? board.timeline.points.filter((p) => p.service === selected) : board.timeline.points;

  return (
    <section className="board" aria-label="Incident proof board">
      <TimelineCard
        points={timeline}
        deployTime={board.deploy.deployedAt}
        selectedService={selectedService}
        open={openEvidence === "timeline"}
        onToggle={() => setOpenEvidence(openEvidence === "timeline" ? null : "timeline")}
        evidence={board.timeline.evidence}
      />
      <HeatmapCard
        board={board}
        selectedService={selectedService}
        setSelectedService={setSelectedService}
        open={openEvidence === "heatmap"}
        onToggle={() => setOpenEvidence(openEvidence === "heatmap" ? null : "heatmap")}
      />
      <DiffCard
        board={board}
        selectedService={selectedService}
        open={openEvidence === "diff"}
        onToggle={() => setOpenEvidence(openEvidence === "diff" ? null : "diff")}
      />
      <SuspectCard
        board={board}
        selectedService={selectedService}
        open={openEvidence === "suspects"}
        onToggle={() => setOpenEvidence(openEvidence === "suspects" ? null : "suspects")}
      />
      <BudgetCard
        board={board}
        open={openEvidence === "budget"}
        onToggle={() => setOpenEvidence(openEvidence === "budget" ? null : "budget")}
      />
      <VerdictCard
        board={board}
        open={openEvidence === "verdict"}
        onToggle={() => setOpenEvidence(openEvidence === "verdict" ? null : "verdict")}
      />
    </section>
  );
}

function TimelineCard({
  points,
  deployTime,
  selectedService,
  open,
  onToggle,
  evidence
}: {
  points: ReturnType<typeof buildIncidentBoard>["timeline"]["points"];
  deployTime: string;
  selectedService: ServiceName | "all";
  open: boolean;
  onToggle: () => void;
  evidence: ReturnType<typeof buildIncidentBoard>["timeline"]["evidence"];
}) {
  const max = Math.max(...points.map((p) => p.p95_ms), 460);
  const width = 920;
  const height = 240;
  const pad = 34;
  const selectedLabel = selectedService === "all" ? "checkout-api p95" : `${selectedService} p95`;
  const line = points
    .map((p, idx) => {
      const x = pad + (idx / Math.max(points.length - 1, 1)) * (width - pad * 2);
      const y = height - pad - (p.p95_ms / max) * (height - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");
  const upper = points
    .map((p, idx) => {
      const x = pad + (idx / Math.max(points.length - 1, 1)) * (width - pad * 2);
      const y = height - pad - ((p.upper_band ?? 180) / max) * (height - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");
  const lower = points
    .slice()
    .reverse()
    .map((p, revIdx) => {
      const idx = points.length - 1 - revIdx;
      const x = pad + (idx / Math.max(points.length - 1, 1)) * (width - pad * 2);
      const y = height - pad - ((p.lower_band ?? 120) / max) * (height - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");
  const deployIdx = points.findIndex((p) => p.minute >= deployTime.slice(0, 16));
  const deployX = deployIdx >= 0 ? pad + (deployIdx / Math.max(points.length - 1, 1)) * (width - pad * 2) : width / 2;

  return (
    <article className="card wide">
      <CardHeader title="Latency timeline" label={selectedLabel} tone="red" />
      <svg viewBox={`0 0 ${width} ${height}`} className="chart" role="img" aria-label="Latency timeline with anomaly band">
        <polygon points={`${upper} ${lower}`} fill="rgba(148, 163, 184, 0.18)" />
        <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} stroke="#334155" />
        <line x1={deployX} x2={deployX} y1={28} y2={height - pad} stroke="#f59e0b" strokeDasharray="5 5" />
        <text x={deployX + 8} y={42} fill="#fbbf24" fontSize="13">deploy 14:32</text>
        <polyline points={line} fill="none" stroke="#38bdf8" strokeWidth="3" />
        {points.filter((p) => p.is_anomaly).map((p, idx) => {
          const realIdx = points.indexOf(p);
          const x = pad + (realIdx / Math.max(points.length - 1, 1)) * (width - pad * 2);
          const y = height - pad - (p.p95_ms / max) * (height - pad * 2);
          return <circle key={`${p.minute}-${idx}`} cx={x} cy={y} r="4" fill="#ef4444" />;
        })}
      </svg>
      <p className="caption">Latency leaves the normal band immediately after the 14:32 payment deploy.</p>
      <EvidenceDrawer evidence={evidence} open={open} onToggle={onToggle} />
    </article>
  );
}

function HeatmapCard({
  board,
  selectedService,
  setSelectedService,
  open,
  onToggle
}: {
  board: ReturnType<typeof buildIncidentBoard>;
  selectedService: ServiceName | "all";
  setSelectedService: (service: ServiceName | "all") => void;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <article className="card">
      <CardHeader title="Service heatmap" label="click a service" tone="amber" />
      <div className="filter-row">
        <button className={selectedService === "all" ? "pill active" : "pill"} onClick={() => setSelectedService("all")}>All services</button>
      </div>
      <div className="heatmap">
        {board.heatmap.services.map((service) => (
          <button
            key={service}
            className={selectedService === service ? "heat-row selected" : "heat-row"}
            onClick={() => setSelectedService(service)}
          >
            <span>{service}</span>
            {board.heatmap.times.map((time, idx) => {
              const value = board.heatmap.values[service][idx] ?? 1;
              return <i key={time} style={{ background: heatColor(value) }} title={`${time}: ${value.toFixed(1)}x`} />;
            })}
          </button>
        ))}
      </div>
      <EvidenceDrawer evidence={board.heatmap.evidence} open={open} onToggle={onToggle} />
    </article>
  );
}

function DiffCard({
  board,
  selectedService,
  open,
  onToggle
}: {
  board: ReturnType<typeof buildIncidentBoard>;
  selectedService: ServiceName | "all";
  open: boolean;
  onToggle: () => void;
}) {
  const max = Math.max(...board.diff.rows.map((r) => r.after_ms), 110);
  return (
    <article className="card">
      <CardHeader title="Before / after diff" label="what changed" tone="red" />
      <div className="bars">
        {board.diff.rows.map((row) => (
          <div key={row.service} className={selectedService === row.service ? "bar-row selected" : "bar-row"}>
            <span>{row.service}</span>
            <b style={{ width: `${(row.before_ms / max) * 100}%` }} className="before" />
            <b style={{ width: `${(row.after_ms / max) * 100}%` }} className={row.amplification > 3 ? "after hot" : "after"} />
            <em>{row.amplification.toFixed(1)}x</em>
          </div>
        ))}
      </div>
      <EvidenceDrawer evidence={board.diff.evidence} open={open} onToggle={onToggle} />
    </article>
  );
}

function SuspectCard({
  board,
  selectedService,
  open,
  onToggle
}: {
  board: ReturnType<typeof buildIncidentBoard>;
  selectedService: ServiceName | "all";
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <article className="card">
      <CardHeader title="Suspect ladder" label="ranked reasoning" tone="green" />
      <ol className="suspects">
        {board.suspects.suspects.map((suspect) => (
          <li key={suspect.service} className={selectedService === suspect.service ? "selected" : ""}>
            <strong>{suspect.rank}. {suspect.service}</strong>
            <span>{Math.round(suspect.confidence * 100)}% · {suspect.status.replace("_", " ")}</span>
          </li>
        ))}
      </ol>
      {open && (
        <div className="reasoning">
          {board.suspects.reasoning.map((step) => (
            <p key={step.step}><strong>Step {step.step}:</strong> {step.finding} <span>{Math.round(step.confidence * 100)}%</span></p>
          ))}
        </div>
      )}
      <EvidenceDrawer evidence={board.suspects.evidence} open={open} onToggle={onToggle} label="Show reasoning + evidence" />
    </article>
  );
}

function BudgetCard({
  board,
  open,
  onToggle
}: {
  board: ReturnType<typeof buildIncidentBoard>;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <article className="card">
      <CardHeader title="Latency error budget" label="SRE impact" tone="amber" />
      <div className="budget">
        <div><b style={{ width: `${board.errorBudget.consumedPct}%` }} /></div>
        <strong>{board.errorBudget.consumedPct}% consumed</strong>
        <p>Burn rate: {board.errorBudget.burnRate}x critical · exhausted in {board.errorBudget.exhaustionEstimate}</p>
      </div>
      <EvidenceDrawer evidence={board.errorBudget.evidence} open={open} onToggle={onToggle} />
    </article>
  );
}

function VerdictCard({
  board,
  open,
  onToggle
}: {
  board: ReturnType<typeof buildIncidentBoard>;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <article className="card wide verdict">
      <CardHeader title="Root-cause verdict" label={`${Math.round(board.verdict.confidence * 100)}% confidence`} tone="red" />
      <h2>{board.verdict.rootCause}</h2>
      <p>{board.verdict.recommendedAction}</p>
      <ul>
        {board.verdict.signals.map((signal) => <li key={signal}>{signal}</li>)}
      </ul>
      <EvidenceDrawer evidence={board.verdict.evidence} open={open} onToggle={onToggle} />
    </article>
  );
}

function CardHeader({ title, label, tone }: { title: string; label: string; tone: "red" | "amber" | "green" }) {
  return (
    <header className="card-header">
      <h2>{title}</h2>
      <span className={`label ${tone}`}>{label}</span>
    </header>
  );
}

function EvidenceDrawer({
  evidence,
  open,
  onToggle,
  label = "Show evidence"
}: {
  evidence: ReturnType<typeof buildIncidentBoard>["timeline"]["evidence"];
  open: boolean;
  onToggle: () => void;
  label?: string;
}) {
  return (
    <footer className="evidence">
      <button onClick={onToggle}>{open ? "Hide evidence" : label}</button>
      {open && (
        <div className="evidence-body">
          <p>{evidence.rowCount} rows · confidence {Math.round(evidence.confidence * 100)}% · {evidence.taskId} {evidence.durationMs ? `(${evidence.durationMs}ms)` : ""}</p>
          <pre>{evidence.query}</pre>
        </div>
      )}
    </footer>
  );
}

function heatColor(value: number) {
  if (value > 5) return "#ef4444";
  if (value > 2) return "#f97316";
  if (value > 1.2) return "#f59e0b";
  return "#334155";
}
