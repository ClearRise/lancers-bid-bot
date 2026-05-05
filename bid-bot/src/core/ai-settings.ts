import { z } from "zod";

const emptyToUndefined = (v: unknown) => {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
};

const schema = z.object({
  BID_AI_PROVIDER: z
    .preprocess(emptyToUndefined, z.enum(["mistral", "openai"]).optional())
    .transform((v) => v ?? "mistral"),
  MISTRAL_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  MISTRAL_MODEL: z.preprocess(emptyToUndefined, z.string().optional()),
  OPENAI_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  OPENAI_MODEL: z.preprocess(emptyToUndefined, z.string().optional()),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const e = parsed.data;

/**
 * Instance-scoped AI settings.
 *
 * `bootstrapInstanceEnvironment()` loads shared `.env` first, then overrides it with
 * `__<id>/config/secrets.env`, so these values are already resolved for the current instance.
 */
export const aiSettings = {
  provider: e.BID_AI_PROVIDER,
  mistral: {
    apiKey: e.MISTRAL_API_KEY,
    model: e.MISTRAL_MODEL ?? "mistral-small-latest",
  },
  openai: {
    apiKey: e.OPENAI_API_KEY,
    model: e.OPENAI_MODEL ?? "gpt-4.1-mini",
  },
};
