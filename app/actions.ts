"use server";

import { auth } from "@trigger.dev/sdk";
import { chat } from "@trigger.dev/sdk/ai";
import { listIncidentCases, saveIncidentCaseFromVerdict } from "../src/lib/incident-cases";
import type { IncidentBoard } from "../src/lib/types";
import type { incidentAgent } from "../trigger/incident-agent";

export const startChatSession = chat.createStartSessionAction<typeof incidentAgent>("incident-agent");

export async function mintChatAccessToken(chatId: string) {
  if (!process.env.TRIGGER_SECRET_KEY) {
    throw new Error("TRIGGER_SECRET_KEY is required for live Trigger.dev chat mode.");
  }

  return auth.createPublicToken({
    scopes: {
      read: { sessions: chatId },
      write: { sessions: chatId }
    },
    expirationTime: "1h"
  });
}

export async function listPromotedIncidents() {
  return listIncidentCases();
}

export async function promoteVerdictToIncident(board: IncidentBoard) {
  return saveIncidentCaseFromVerdict(board);
}
