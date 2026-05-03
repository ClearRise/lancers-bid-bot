import { config } from "../core/config.js";
import type { TaskDetail } from "../core/types.js";

let warnedMissingPrompt = false;

type GroqResponse = {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

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

function extractText(data: GroqResponse): string {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }
  const out = Array.isArray(data.output) ? data.output : [];
  const textParts: string[] = [];
  for (const item of out) {
    const blocks = Array.isArray(item.content) ? item.content : [];
    for (const block of blocks) {
      if (block.type === "output_text" && typeof block.text === "string") {
        textParts.push(block.text);
      }
    }
  }
  return textParts.join("\n").trim();
}

export async function generateProposalText(detail: TaskDetail): Promise<string | null> {
  if (!config.enableAiProposal) return null;

  const prompt = createPrompt(detail);
  console.log("[ai-proposal-groq] prompt: ", prompt);
  if (!prompt) {
    if (!warnedMissingPrompt) {
      console.warn("[ai-proposal-groq] Missing prompt file: config/proposal_prompt.txt");
      warnedMissingPrompt = true;
    }
    return null;
  }

  const apiKey = process.env.GROQ_API_KEY;
  const baseUrl = process.env.GROQ_BASE_URL;
  if (!apiKey || !baseUrl) {
    console.warn("[ai-proposal-groq] GROQ_API_KEY or GROQ_BASE_URL is not set");
    return null;
  }

  try {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL ?? "openai/gpt-oss-20b",
        input: prompt,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(
        `[ai-proposal-groq] API request failed status=${res.status} message=${errText.slice(0, 500)}`,
      );
      return null;
    }

    const data = (await res.json()) as GroqResponse;
    const text = extractText(data);
    if (!text) {
      console.warn("[ai-proposal-groq] Empty completion content.");
      return null;
    }
    return text;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ai-proposal-groq] API request failed error=${message}`);
    return null;
  }
}
