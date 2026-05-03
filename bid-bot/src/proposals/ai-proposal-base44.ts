import { config } from "../core/config.js";
import type { TaskDetail } from "../core/types.js";

let warnedMissingPrompt = false;

type Base44Message = {
  id?: string;
  role?: string;
  content?: string;
  tool_calls?: unknown[];
  file_urls?: string[];
};

type Base44Response = {
  id?: string;
  app_id?: string;
  agent_name?: string;
  messages?: Base44Message[];
  role?: string;
  content?: string;
  metadata?: Record<string, unknown>;
};

function extractAssistantContent(data: Base44Response): string {
  if (typeof data.content === "string" && data.content.trim()) {
    return data.content.trim();
  }

  const messages = Array.isArray(data.messages) ? data.messages : [];
  const assistant = [...messages].reverse().find((m) => m.role === "assistant");
  if (typeof assistant?.content === "string" && assistant.content.trim()) {
    return assistant.content.trim();
  }

  return "";
}

function createPrompt(detail: TaskDetail): string {
  const template = config.proposalAiPromptTemplate;
  if (!template) return "";

  return template
    .replaceAll("{{WORK_ID}}", detail.workId)
    .replaceAll("{{TITLE}}", detail.title)
    .replaceAll("{{DESCRIPTION}}", detail.description)
    .replaceAll("{{BUDGET_TEXT}}", detail.budgetText ?? "")
    .replaceAll("{{BUDGET_MIN_JPY}}", detail.budgetMinJpy != null ? String(detail.budgetMinJpy) : "")
    .replaceAll("{{BUDGET_MAX_JPY}}", detail.budgetMaxJpy != null ? String(detail.budgetMaxJpy) : "")
    .replaceAll("{{DEADLINE}}", detail.deadline ?? "");
}

function getBase44Config(): {
  baseUrl: string;
  conversationId: string;
  apiKey: string;
} | null {
  const baseUrl = process.env.BASE44_BASE_URL;
  const conversationId = process.env.BASE44_CONVERSATION_ID;
  const apiKey = process.env.BASE44_API_KEY;
  if (!baseUrl || !conversationId || !apiKey) return null;
  return { baseUrl, conversationId, apiKey };
}

export async function generateProposalText(detail: TaskDetail): Promise<string | null> {
  if (!config.enableAiProposal) return null;

  const prompt = createPrompt(detail);
  if (!prompt) {
    if (!warnedMissingPrompt) {
      console.warn("[ai-proposal-base44] Missing prompt file: config/proposal_prompt.txt");
      warnedMissingPrompt = true;
    }
    return null;
  }

  const base44 = getBase44Config();
  if (!base44) {
    console.warn(
      "[ai-proposal-base44] BASE44_BASE_URL or BASE44_CONVERSATION_ID or BASE44_API_KEY is not set",
    );
    return null;
  }

  const url = `${base44.baseUrl.replace(/\/+$/, "")}/conversations/${base44.conversationId}/messages`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        api_key: base44.apiKey,
      },
      body: JSON.stringify({
        role: "user",
        content: prompt,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        `[ai-proposal-base44] API request failed status=${res.status} message=${text.slice(0, 500)}`,
      );
      return null;
    }

    const data = (await res.json()) as Base44Response;
    const text = extractAssistantContent(data);
    if (!text) {
      console.warn("[ai-proposal-base44] Empty assistant content.");
      return null;
    }
    return text;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ai-proposal-base44] API request failed error=${message}`);
    return null;
  }
}
