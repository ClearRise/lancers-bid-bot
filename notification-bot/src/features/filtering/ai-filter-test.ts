import { Mistral } from "@mistralai/mistralai";
import { config } from "../../core/config.js";
import type { ScrapedTask } from "../../core/types.js";

type AiDecision = {
  suitable: boolean;
  reason?: string;
};

let warnedMissingPrompt = false;
let client: Mistral | null = null;
let selectedModel: string | null = null;

function resolveMistralModel(): string {
  const envModel = process.env.MISTRAL_MODEL?.trim();
  if (envModel) return envModel;

  const configured = config.aiModel?.trim();
  if (configured && !configured.includes("/")) return configured;

  return "mistral-small-latest";
}

function getClient(): Mistral | null {
  if (client) return client;

  const mistralApiKey = process.env.MISTRAL_API_KEY;
  if (!mistralApiKey) return null;

  selectedModel = resolveMistralModel();

  client = new Mistral({
    apiKey: mistralApiKey,
  });

  return client;
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
  if (!prompt) {
    if (!warnedMissingPrompt) {
      console.warn(
        "[ai-filter] Missing aiPromptTemplate in config/settings.json, AI filter is bypassed.",
      );
      warnedMissingPrompt = true;
    }
    return { suitable: true, reason: "prompt-missing" };
  }

  const mistralClient = getClient();
  if (!mistralClient) {
    console.log(`[ai-filter][${task.workId}] config_missing`);
    return {
      suitable: false,
      reason: "MISTRAL_API_KEY is not set",
    };
  }

  const completion = await mistralClient.chat.complete({
    model: selectedModel ?? config.aiModel,
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
    return { suitable: false, reason: `[ai filter response parse failed] ${text}` };
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]) as { suitable?: boolean; reason?: string };
    return {
      suitable: parsed.suitable === true,
      reason: parsed.reason,
    };
  } catch {
    return { suitable: false, reason: `[ai filter response parse failed] ${text}` };
  }
}
