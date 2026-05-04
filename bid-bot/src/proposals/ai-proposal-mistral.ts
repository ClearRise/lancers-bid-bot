import { Mistral } from "@mistralai/mistralai";
import { config } from "../core/config.js";
import type { TaskDetail } from "../core/types.js";

let client: Mistral | null = null;
let warnedMissingPrompt = false;

function getClient(): Mistral | null {
  if (client) return client;
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) return null;

  client = new Mistral({ apiKey: apiKey });
  return client;
}

function createPrompt(detail: TaskDetail): string {
  const template = config.proposalAiPromptTemplate;
  if (!template) return "";

  return template
    .replaceAll("{{WORK_ID}}", detail.workId)
    .replaceAll("{{TITLE}}", detail.title)
    .replaceAll("{{DESCRIPTION}}", detail.description)
    .replaceAll("{{CLIENT_NAME}}", detail.clientName ?? "")
    .replaceAll("{{BUDGET_TEXT}}", detail.budgetText ?? "")
    .replaceAll("{{BUDGET_MIN_JPY}}", detail.budgetMinJpy != null ? String(detail.budgetMinJpy) : "")
    .replaceAll("{{BUDGET_MAX_JPY}}", detail.budgetMaxJpy != null ? String(detail.budgetMaxJpy) : "")
    .replaceAll("{{DEADLINE}}", detail.deadline ?? "");
}

function extractText(result: unknown): string {
  const asAny = result as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const raw = asAny.choices?.[0]?.message?.content;
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw)) {
    const merged = raw
      .map((x) =>
        typeof x === "string"
          ? x
          : typeof x === "object" && x && "text" in x
            ? String((x as { text?: unknown }).text ?? "")
            : "",
      )
      .join("\n")
      .trim();
    return merged;
  }
  return "";
}

export async function generateProposalText(detail: TaskDetail): Promise<string | null> {
  if (!config.enableAiProposal) return null;

  const prompt = createPrompt(detail);
  if (!prompt) {
    if (!warnedMissingPrompt) {
      console.warn("[ai-proposal-mistral] Missing or empty proposal_prompt.txt in profile folder (or __config/ or config/)");
      warnedMissingPrompt = true;
    }
    return null;
  }

  const mistral = getClient();
  if (!mistral) {
    console.warn("[ai-proposal-mistral] MISTRAL_API_KEY is not set");
    return null;
  }

  try {
    const result = await mistral.chat.complete({
      model: process.env.MISTRAL_MODEL ?? "mistral-small-latest",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const text = extractText(result);
    if (!text) {
      console.warn("[ai-proposal-mistral] Empty completion content.");
      return null;
    }
    return text;
  } catch (error) {
    const e = error as {
      message?: string;
      statusCode?: number;
      response?: unknown;
    };
    const status = e?.statusCode != null ? String(e.statusCode) : "unknown";
    const message = e?.message ?? String(error);
    console.error(`[ai-proposal-mistral] API request failed status=${status} message=${message}`);
    if (e?.response !== undefined) {
      console.error("[ai-proposal-mistral] API error response:", e.response);
    }
    return null;
  }
}
