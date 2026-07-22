// @ts-nocheck
import { schemaTask } from "@trigger.dev/sdk";
import { ai, chat } from "@trigger.dev/sdk/ai";
import { tool } from "ai";
import { z } from "zod";
import { buildIncidentBoard } from "../src/lib/investigation";

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

const taskTool = (task: unknown, description: string, schema: z.ZodTypeAny) => {
  if (ai?.tool) return ai.tool(task);

  return tool({
    description,
    inputSchema: schema,
    execute: async () => buildIncidentBoard()
  });
};

const tools = {
  queryLatency: taskTool(queryLatencyTask, "Query latency timeline and anomaly band from ClickHouse", windowSchema),
  queryHeatmap: taskTool(queryHeatmapTask, "Query service heatmap from ClickHouse", windowSchema),
  rankSuspects: taskTool(rankSuspectsTask, "Rank likely root-cause services", windowSchema),
  queryDiff: taskTool(queryDiffTask, "Compare span durations before and after deploy", z.object({ deployTime: z.string() })),
  calculateErrorBudget: taskTool(calculateErrorBudgetTask, "Calculate latency error budget consumption", windowSchema)
};

export const incidentAgent = chat.agent({
  id: "incident-agent",
  tools,
  onTurnStart: async () => {
    chat.local.set("incident-context", {
      deployTime: "2026-07-22 14:32:00",
      expectedRootCause: "payment-service retry timeout changed from 3s to 15s"
    });
  },
  run: async () => {
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

    return new Response("Incident proof board generated from ClickHouse-backed investigation data.");
  }
});
