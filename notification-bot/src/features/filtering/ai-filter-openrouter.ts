import OpenAI from "openai";
import { config } from "../../core/config.js";
import type { ScrapedTask } from "../../core/types.js";

type AiDecision = {
  suitable: boolean;
  reason?: string;
};

let warnedMissingPrompt = false;
let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (client) return client;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const defaultHeaders: Record<string, string> = {};
  if (process.env.OPENROUTER_SITE_URL) {
    defaultHeaders["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL;
  }
  if (process.env.OPENROUTER_SITE_NAME) {
    defaultHeaders["X-OpenRouter-Title"] = process.env.OPENROUTER_SITE_NAME;
  }

  client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders,
  });

  return client;
}

function createPrompt(task: ScrapedTask): string {
  const template = config.aiPromptTemplate;
  const snippet = task.snippet.slice(0, config.aiMaxSnippetChars);
  const includeKeywords = config.includeKeywords.join(", ");

  if (!template) return "";

  return template
    .replaceAll("{{TITLE}}", task.title)
    .replaceAll("{{SNIPPET}}", snippet)
    .replaceAll("{{INCLUDE_KEYWORDS}}", includeKeywords);
}

export async function isTaskSuitableByAi(task: ScrapedTask): Promise<AiDecision> {
  const prompt = createPrompt(task);
  console.log("AI filter prompt: ", prompt, "\n-------------------------\n");
  if (!prompt) {
    if (!warnedMissingPrompt) {
      console.warn(
        "[ai-filter] Missing aiPromptTemplate in config/settings.json, AI filter is bypassed.",
      );
      warnedMissingPrompt = true;
    }
    return { suitable: true, reason: "prompt-missing" };
  }

  const openrouter = getClient();
  if (!openrouter) {
    return { suitable: false, reason: "OPENROUTER_API_KEY is not set" };
  }

  const completion = await openrouter.chat.completions.create({
    model: config.aiModel,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0,
  });

  const raw = completion.choices?.[0]?.message?.content;
  const text = typeof raw === "string" ? raw : Array.isArray(raw) ? JSON.stringify(raw) : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { suitable: false, reason: `AI response parse failed: ${text.slice(0, 160)}` };
  }
  console.log("AI filter response: ", text, "\n-------------------------\n");
  try {
    const parsed = JSON.parse(jsonMatch[0]) as { suitable?: boolean; reason?: string };
    return {
      suitable: parsed.suitable === true,
      reason: parsed.reason,
    };
  } catch {
    return { suitable: false, reason: `AI response parse failed: ${text.slice(0, 160)}` };
  }
}
