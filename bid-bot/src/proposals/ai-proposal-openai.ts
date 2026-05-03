import OpenAI from "openai";
import { config } from "../core/config.js";
import type { TaskDetail } from "../core/types.js";

let client: OpenAI | null = null;
let warnedMissingPrompt = false;

function getClient(): OpenAI | null {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  client = new OpenAI({
    apiKey,
  });
  return client;
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

export async function generateProposalText(detail: TaskDetail): Promise<string | null> {
  if (!config.enableAiProposal) return null;

  const prompt = createPrompt(detail);
  if (!prompt) {
    if (!warnedMissingPrompt) {
      console.warn("[ai-proposal-openai] Missing prompt file: config/proposal_prompt.txt");
      warnedMissingPrompt = true;
    }
    return null;
  }

  const openai = getClient();
  if (!openai) {
    console.warn("[ai-proposal-openai] OPENAI_API_KEY is not set");
    return null;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: "Write natural and practical Japanese business proposals.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.4,
    });

    const raw = completion.choices?.[0]?.message?.content;
    const text = typeof raw === "string" ? raw.trim() : "";
    if (!text) {
      console.warn("[ai-proposal-openai] Empty completion content.");
      return null;
    }
    return text;
  } catch (error) {
    const e = error as {
      message?: string;
      status?: number;
      code?: string;
      response?: { data?: unknown };
    };
    const status = e?.status != null ? String(e.status) : "unknown";
    const code = e?.code ?? "unknown";
    const message = e?.message ?? String(error);
    const responseData = e?.response?.data;
    console.error(
      `[ai-proposal-openai] API request failed status=${status} code=${code} message=${message}`,
    );
    if (responseData !== undefined) {
      console.error("[ai-proposal-openai] API error response:", responseData);
    }
    return null;
  }
}
