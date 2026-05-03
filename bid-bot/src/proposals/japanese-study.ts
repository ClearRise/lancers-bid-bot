import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Mistral } from "@mistralai/mistralai";
import { config } from "../core/config.js";

function resolveFromSrc(relativePathFromSrc: string): string {
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFilePath);
  return path.resolve(currentDir, relativePathFromSrc);
}

function loadNativeJapaneseSentences(): string[] {
  const corpusPath = resolveFromSrc("../../config/native_japanese_sentences.txt");
  try {
    const raw = fs.readFileSync(corpusPath, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
  } catch (error) {
    console.warn(`[study-japanese] failed to read corpus file: ${corpusPath}`, error);
    return [];
  }
}

export async function studyNativeJapanese(trigger: string): Promise<void> {
  const apiKey = process.env.MISTRAL_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[study-japanese] skipped: MISTRAL_API_KEY is not set");
    return;
  }

  const corpus = loadNativeJapaneseSentences();
  if (corpus.length === 0) {
    console.warn("[study-japanese] skipped: no sentences found in native_japanese_sentences.txt");
    return;
  }

  const mistral = new Mistral({ apiKey });
  const lesson = corpus.join("\n");

  await mistral.chat.complete({
    model: process.env.MISTRAL_MODEL ?? "mistral-small-latest",
    messages: [
      {
        role: "system",
        content:
          "以下は日本語ネイティブの自然な文例です。語彙・語感・丁寧さを学習し、今後の提案文で自然で読みやすい日本語を優先してください。学習完了を一文で返してください。",
      },
      {
        role: "user",
        content: `trigger=${trigger}\n\n[文例]\n${lesson}`,
      },
    ],
    temperature: 0,
  });

  console.log(`[study-japanese] completed trigger=${trigger} sentences=${corpus.length}`);
}

async function runCli(): Promise<void> {
  await studyNativeJapanese("manual-cli");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runCli().catch((err) => {
    console.error("[study-japanese] failed", err);
    process.exit(1);
  });
}
