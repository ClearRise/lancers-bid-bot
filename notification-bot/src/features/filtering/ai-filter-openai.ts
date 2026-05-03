import OpenAI from "openai";
import { config } from "../../core/config.js";
import type { ScrapedTask } from "../../core/types.js";

type AiDecision = {
  suitable: boolean;
  reason?: string;
};

let client: OpenAI | null = null;
let warnedMissingPrompt = false;

function getClient(): OpenAI | null {
  if (!config.openaiApiKey) return null;
  if (client) return client;

  client = new OpenAI({
    apiKey: config.openaiApiKey,
  });

  return client;
}

function normalizeOpenAiModel(model: string): string {
  if (model.startsWith("openai/")) return model.slice("openai/".length);
  return model;
}

function createPrompt(task: ScrapedTask): string {
  const template = config.aiPromptTemplate;
  const snippet = task.snippet.slice(0, config.aiMaxSnippetChars);
  const includeKeywords = config.includeKeywords.join(", ");
  const excludeKeywords = config.excludeKeywords.join(", ");

  if (!template) return "";

  return template
    .replaceAll("{{TITLE}}", task.title)
    .replaceAll("{{SNIPPET}}", snippet)
    .replaceAll("{{INCLUDE_KEYWORDS}}", includeKeywords)
    .replaceAll("{{EXCLUDE_KEYWORDS}}", excludeKeywords);
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

  const openai = getClient();
  if (!openai) {
    return { suitable: false, reason: "OPENAI_API_KEY is not set" };
  }

  const completion = await openai.chat.completions.create({
    model: normalizeOpenAiModel(config.aiModel),
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
