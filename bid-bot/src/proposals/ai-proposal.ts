import OpenAI from "openai";
import { config } from "../core/config.js";
import type { TaskDetail } from "../core/types.js";

let client: OpenAI | null = null;
let warnedMissingPrompt = false;

function getClient(): OpenAI | null {
  if (client) return client;
  const apiKey = process.env.INFERENCE_API_KEY;
  const baseURL = process.env.INFERENCE_BASE_URL;
  if (!apiKey || !baseURL) return null;

  client = new OpenAI({
    apiKey,
    baseURL,
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
      console.warn("[ai-proposal] Missing prompt file: config/proposal_prompt.txt");
      warnedMissingPrompt = true;
    }
    return null;
  }

  const inferenceClient = getClient();
  if (!inferenceClient) {
    console.warn("[ai-proposal] INFERENCE_API_KEY or INFERENCE_BASE_URL is not set");
    return null;
  }

  const completion = await inferenceClient.chat.completions.create({
    model: process.env.INFERENCE_MODEL ?? "minimax/minimax-m2.5",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.4,
  });

  const raw = completion.choices?.[0]?.message?.content;
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return null;
  return text;
}
