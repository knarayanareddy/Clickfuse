import { prompts, schemaTask } from "@trigger.dev/sdk";
import { ai, chat } from "@trigger.dev/sdk/ai";
import { openai } from "@ai-sdk/openai";
import { createProviderRegistry, stepCountIs, streamText, tool } from "ai";
import type { InferUITools, UIDataTypes, UIMessage } from "ai";
import { z } from "zod";
import { buildIncidentBoard } from "../src/lib/investigation";
import type { IncidentBoard } from "../src/lib/types";

const registry = createProviderRegistry({ openai });

const incidentContext = chat.local<{
  deployTime: string;
  expectedRootCause: string;
}>({ id: "incident-context" });

const incidentSystemPrompt = prompts.define({
  id: "clickfuse-incident-investigator",
  description: "Guides Clickfuse through a bounded evidence-backed latency investigation.",
  model: "openai:gpt-4o-mini",
  config: { temperature: 0.2 },
  variables: z.object({
    deployTime: z.string(),
    rootCauseHint: z.string()
  }),
  content: `You are Clickfuse, an SRE investigation agent.

Answer the user's latency question by building an evidence-backed incident proof board.
Use the available tools before giving a verdict. Keep the narrative concise and do not invent facts outside the tool outputs.

Known investigation anchor:
- Deploy time: {{deployTime}}
- Candidate root cause to verify: {{rootCauseHint}}

The final answer should explain what changed, why payment-service is the strongest suspect, and which rollback/action to take.`
});

const windowSchema = z.object({
  windowStart: z.string().default("2026-07-22 14:00:00"),
  windowEnd: z.string().default("2026-07-22 15:00:00"),
  service: z.string().optional()
});

export const queryLatencyTask = schemaTask({
  id: "query-latency",
  schema: windowSchema,
  run: async () => {
    const board = buildIncidentBoard();
    return board.timeline;
  }
});

export const queryHeatmapTask = schemaTask({
  id: "query-heatmap",
  schema: windowSchema,
  run: async () => {
    const board = buildIncidentBoard();
    return board.heatmap;
  }
});

export const rankSuspectsTask = schemaTask({
  id: "rank-suspects",
  schema: windowSchema,
  run: async () => {
    const board = buildIncidentBoard();
    return board.suspects;
  }
});

export const queryDiffTask = schemaTask({
  id: "query-diff",
  schema: z.object({ deployTime: z.string().default("2026-07-22 14:32:00") }),
  run: async () => {
    const board = buildIncidentBoard();
    return board.diff;
  }
});

export const calculateErrorBudgetTask = schemaTask({
  id: "calculate-error-budget",
  schema: windowSchema,
  run: async () => {
    const board = buildIncidentBoard();
    return board.errorBudget;
  }
});

const tools = {
  queryLatency: tool({
    description: "Query the latency timeline and anomaly band for the incident window.",
    inputSchema: windowSchema,
    execute: ai.toolExecute(queryLatencyTask)
  }),
  queryHeatmap: tool({
    description: "Query service-level heatmap intensity for the incident window.",
    inputSchema: windowSchema,
    execute: ai.toolExecute(queryHeatmapTask)
  }),
  rankSuspects: tool({
    description: "Rank likely root-cause services with supporting and contradicting signals.",
    inputSchema: windowSchema,
    execute: ai.toolExecute(rankSuspectsTask)
  }),
  queryDiff: tool({
    description: "Compare span durations before and after the deploy.",
    inputSchema: z.object({ deployTime: z.string().default("2026-07-22 14:32:00") }),
    execute: ai.toolExecute(queryDiffTask)
  }),
  calculateErrorBudget: tool({
    description: "Calculate latency error-budget impact for the incident window.",
    inputSchema: windowSchema,
    execute: ai.toolExecute(calculateErrorBudgetTask)
  })
};

type IncidentTools = InferUITools<typeof tools>;
type IncidentDataTypes = UIDataTypes & {
  timeline: IncidentBoard["timeline"];
  heatmap: IncidentBoard["heatmap"];
  diff: IncidentBoard["diff"];
  suspect: IncidentBoard["suspects"];
  "error-budget": IncidentBoard["errorBudget"];
  verdict: IncidentBoard["verdict"];
};

export type IncidentUIMessage = UIMessage<unknown, IncidentDataTypes, IncidentTools>;

export const incidentAgent = chat.withUIMessage<IncidentUIMessage>().agent({
  id: "incident-agent",
  tools,
  onBoot: async () => {
    incidentContext.init({
      deployTime: "2026-07-22 14:32:00",
      expectedRootCause: "payment-service retry timeout changed from 3s to 15s"
    });

    const prompt = await incidentSystemPrompt.resolve({
      deployTime: incidentContext.deployTime,
      rootCauseHint: incidentContext.expectedRootCause
    });

    chat.prompt.set(prompt);
  },
  onTurnStart: async ({ writer }) => {
    writer.write({
      type: "data-status",
      transient: true,
      data: { status: "investigating", deployTime: incidentContext.deployTime }
    });
  },
  run: async ({ messages, signal, tools }) => {
    const board = buildIncidentBoard();

    chat.response.write({
      type: "data-timeline",
      data: board.timeline
    });
    chat.response.write({
      type: "data-heatmap",
      data: board.heatmap
    });
    chat.response.write({
      type: "data-diff",
      data: board.diff
    });
    chat.response.write({
      type: "data-suspect",
      data: board.suspects
    });
    chat.response.write({
      type: "data-error-budget",
      data: board.errorBudget
    });
    chat.response.write({
      type: "data-verdict",
      data: board.verdict
    });

    return streamText({
      ...chat.toStreamTextOptions({ registry, tools }),
      model: openai("gpt-4o-mini"),
      messages,
      abortSignal: signal,
      stopWhen: stepCountIs(6)
    });
  }
});
