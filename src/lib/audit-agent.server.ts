// ─── AI provider resolution ─────────────────────────────────────────────────
// Server only. Builds an ordered cascade of every provider that has a usable
// key, then proves the first one that actually answers before the chat route
// streams with it.
//
// Order: Lovable AI gateway (hosted default) → Google Gemini → OpenAI →
// OpenRouter → Groq. The cascade exists because keys expire, projects get
// suspended and free models get retired; without it a single dead key makes
// every prompt fail with a generic error.

import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, type LanguageModel } from "ai";
import { serverEnv, type EnvBag } from "./env.server";

export const AI_MODEL = "openai/gpt-6-astra";
const GATEWAY = "https://ai.gateway.lovable.dev/v1";

/** Required request options for Lovable's /v1/responses models. */
const LOVABLE_PROVIDER_OPTIONS = {
  openai: {
    forceReasoning: true,
    reasoningEffort: "low",
    reasoningSummary: "auto",
    store: false,
    include: ["reasoning.encrypted_content"],
  },
} as const;

/** Empty options for non-Lovable providers (they don't support reasoning_content). */
const DEFAULT_PROVIDER_OPTIONS = {} as const;

export interface ResolvedModel {
  provider: "lovable" | "gemini" | "openai" | "openrouter" | "groq";
  modelId: string;
  model: LanguageModel;
  providerOptions: Record<string, unknown>;
  cascade: Array<{
    id: string;
    model: LanguageModel;
    provider: ResolvedModel["provider"];
    modelId: string;
    providerOptions: Record<string, unknown>;
  }>;
}

/** Gemini 2.x is closed to new Google AI Studio users. Never send these IDs. */
const RETIRED_GEMINI_IDS = new Set([
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-exp",
  "gemini-2.0-flash-001",
  "gemini-2.0-flash-lite-001",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-1.0-pro",
]);

/** Hardcoded chat model — env cannot point us back at Gemini 2.5. */
const GEMINI_CHAT_MODEL = "gemini-3.8-flash";

function geminiModelId(env?: EnvBag): string {
  const configured = serverEnv("GEMINI_MODEL", env);
  if (
    configured &&
    configured.startsWith("gemini-3") &&
    !RETIRED_GEMINI_IDS.has(configured)
  ) {
    return configured;
  }
  return GEMINI_CHAT_MODEL;
}

function isUnusableGemini(modelId: string, message?: string): boolean {
  if (RETIRED_GEMINI_IDS.has(modelId) || /gemini-2\.[05]|gemini-1\./i.test(modelId)) return true;
  if (message && /no longer available|not found|is not found/i.test(message)) return true;
  return false;
}

/**
 * Builds the provider cascade. Returns null only when no provider has a key —
 * callers turn that into a configuration error the operator can act on.
 */
export async function resolveAgentModel(env?: EnvBag): Promise<ResolvedModel | null> {
  const cascade: ResolvedModel["cascade"] = [];

  const lovableKey = serverEnv("LOVABLE_API_KEY", env);
  if (lovableKey) {
    const provider = createOpenAI({
      baseURL: GATEWAY,
      apiKey: lovableKey,
      headers: { "Lovable-API-Key": lovableKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });
    const modelId = serverEnv("LOVABLE_AI_MODEL", env) ?? AI_MODEL;
    cascade.push({
      id: modelId,
      model: provider.responses(modelId) as unknown as LanguageModel,
      provider: "lovable",
      modelId,
      providerOptions: LOVABLE_PROVIDER_OPTIONS as unknown as Record<string, unknown>,
    });
  }

  const openAIKey = serverEnv("OPENAI_API_KEY", env);
  if (openAIKey) {
    const modelId = serverEnv("OPENAI_MODEL", env) ?? "gpt-4o-mini";
    const provider = createOpenAI({ apiKey: openAIKey });
    cascade.push({
      id: modelId,
      model: provider.chat(modelId) as unknown as LanguageModel,
      provider: "openai",
      modelId,
      providerOptions: DEFAULT_PROVIDER_OPTIONS as unknown as Record<string, unknown>,
    });
  }

  const geminiKey =
    serverEnv("GEMINI_API_KEY", env) ?? serverEnv("GOOGLE_GENERATIVE_AI_API_KEY", env);
  if (geminiKey) {
    const provider = createGoogleGenerativeAI({ apiKey: geminiKey });
    const seen = new Set<string>();
    for (const modelId of [geminiModelId(env), GEMINI_CHAT_MODEL]) {
      if (seen.has(modelId) || isUnusableGemini(modelId)) continue;
      seen.add(modelId);
      cascade.push({
        id: modelId,
        model: provider(modelId) as unknown as LanguageModel,
        provider: "gemini",
        modelId,
        providerOptions: DEFAULT_PROVIDER_OPTIONS as unknown as Record<string, unknown>,
      });
    }
  }

  const openRouterKey = serverEnv("OPENROUTER_API_KEY", env);
  if (openRouterKey) {
    const modelId = serverEnv("OPENROUTER_MODEL", env) ?? "openai/gpt-4o-mini";
    const provider = createOpenAICompatible({
      name: "openrouter",
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: openRouterKey,
      headers: {
        "HTTP-Referer": serverEnv("VITE_APP_URL", env) ?? "https://psxl.live",
        "X-Title": "Wab",
      },
    });
    cascade.push({
      id: modelId,
      model: provider.chatModel(modelId) as unknown as LanguageModel,
      provider: "openrouter",
      modelId,
      providerOptions: DEFAULT_PROVIDER_OPTIONS as unknown as Record<string, unknown>,
    });
  }

  // Groq last: llama-3.3-70b often returns "high demand" even after a healthy probe.
  const groqKey = serverEnv("GROQ_API_KEY", env);
  if (groqKey) {
    // GPT-OSS on Groq returns a reasoning payload by default. During a
    // multi-step tool cycle the AI SDK can carry that payload into the next
    // assistant history message, where Groq rejects reasoning_content (HTTP 400).
    // Disable reasoning in the actual outbound body for every model step/probe.
    const groqFetch: typeof fetch = async (input, init) => {
      const body = init?.body;
      if (typeof body === "string") {
        try {
          const payload = JSON.parse(body) as Record<string, unknown>;
          if (typeof payload.model === "string" && payload.model.startsWith("openai/gpt-oss-")) {
            payload.include_reasoning = false;
            delete payload.reasoning_format;
          }
          return fetch(input, { ...init, body: JSON.stringify(payload) });
        } catch {
          // Preserve non-JSON request bodies.
        }
      }
      return fetch(input, init);
    };
    const provider = createOpenAICompatible({
      name: "groq",
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: groqKey,
      fetch: groqFetch,
    });
    const groqModels = [
      serverEnv("GROQ_MODEL", env) ?? "llama-3.1-8b-instant",
      "llama-3.1-8b-instant",
      "openai/gpt-oss-20b",
      "llama-3.3-70b-versatile",
    ];
    const seen = new Set<string>();
    for (const modelId of groqModels) {
      if (seen.has(modelId)) continue;
      seen.add(modelId);
      cascade.push({
        id: modelId,
        model: provider.chatModel(modelId) as unknown as LanguageModel,
        provider: "groq",
        modelId,
        providerOptions: DEFAULT_PROVIDER_OPTIONS as unknown as Record<string, unknown>,
      });
    }
  }

  if (cascade.length === 0) return null;

  const first = cascade[0]!;
  return {
    provider: first.provider,
    modelId: first.modelId,
    model: first.model,
    providerOptions: first.providerOptions,
    cascade,
  };
}

// ── Reachability probing ────────────────────────────────────────────────────

export interface ProviderAttempt {
  provider: string;
  modelId: string;
  ok: boolean;
  status?: number;
  message?: string;
}

interface ProbeResult {
  ok: boolean;
  until: number;
  status?: number;
  message?: string;
}

/** Per-isolate memory so a dead provider is not re-probed on every message. */
const probeCache = new Map<string, ProbeResult>();
const HEALTHY_TTL_MS = 15 * 60_000; // 15 min — don't re-probe a working provider too often
const UNHEALTHY_TTL_MS = 60_000;    // 1 min — retry a failing provider more quickly
const CAPACITY_TTL_MS = 5 * 60_000; // 5 min — skip models that are overloaded

export function isCapacityError(error: unknown): boolean {
  const status =
    (error as { statusCode?: number }).statusCode ?? (error as { status?: number }).status;
  const message = [
    (error as Error).message,
    (error as { responseBody?: string }).responseBody,
    (error as { cause?: { message?: string } }).cause?.message,
  ]
    .filter(Boolean)
    .join(" ");
  if (status === 429 || status === 503) return true;
  return /high demand|overloaded|capacity|rate.?limit|try again later|resource exhausted|temporarily unavailable|unavailable for|Failed after \d+ attempts/i.test(
    message,
  );
}

export function markProviderUnhealthy(
  provider: string,
  modelId: string,
  message: string,
  status?: number,
): void {
  probeCache.set(`${provider}:${modelId}`, {
    ok: false,
    until: Date.now() + CAPACITY_TTL_MS,
    message,
    ...(status === undefined ? {} : { status }),
  });
}

function describeProbeError(error: unknown): { status?: number; message: string } {
  const status =
    (error as { statusCode?: number }).statusCode ??
    (error as { status?: number }).status ??
    (error as { cause?: { status?: number } }).cause?.status;

  const raw =
    (error as { responseBody?: string }).responseBody ??
    (error as { cause?: { message?: string } }).cause?.message ??
    (error as Error).message ??
    "Unknown provider error";

  let message = String(raw);
  try {
    const parsed = JSON.parse(message) as {
      error?: { message?: string } | string;
      message?: string;
    };
    const nested = typeof parsed.error === "string" ? parsed.error : parsed.error?.message;
    message = nested ?? parsed.message ?? message;
  } catch {
    // plain text body — keep it
  }
  return status === undefined
    ? { message: message.slice(0, 300) }
    : { status, message: message.slice(0, 300) };
}

async function probe(entry: ResolvedModel["cascade"][number]): Promise<ProbeResult> {
  const cacheKey = `${entry.provider}:${entry.modelId}`;
  const cached = probeCache.get(cacheKey);
  if (cached && cached.until > Date.now()) return cached;

  try {
    await generateText({
      model: entry.model,
      prompt: "Reply with OK.",
      maxOutputTokens: 4,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(8_000),
      providerOptions: entry.providerOptions as never,
    });
    const result: ProbeResult = { ok: true, until: Date.now() + HEALTHY_TTL_MS };
    probeCache.set(cacheKey, result);
    return result;
  } catch (error) {
    const described = describeProbeError(error);
    const ttl = isCapacityError(error) ? CAPACITY_TTL_MS : UNHEALTHY_TTL_MS;
    const result: ProbeResult = {
      ok: false,
      until: Date.now() + ttl,
      ...(described.status === undefined ? {} : { status: described.status }),
      message: described.message,
    };
    probeCache.set(cacheKey, result);
    return result;
  }
}

export interface WorkingModel extends ResolvedModel {
  attempts: ProviderAttempt[];
}

/**
/**
 * Returns the first provider in the cascade that really answers. Probes all
 * providers in parallel (capped at 8s each) and returns the first healthy one
 * in cascade priority order — so Lovable beats Gemini beats OpenAI even if
 * all probes finish at the same time.
 */
export async function selectWorkingModel(resolved: ResolvedModel | null): Promise<{
  model: WorkingModel | null;
  attempts: ProviderAttempt[];
}> {
  if (!resolved) return { model: null, attempts: [] };

  // Fire all probes in parallel
  const probeResults = await Promise.all(resolved.cascade.map((entry) => probe(entry)));

  const attempts: ProviderAttempt[] = probeResults.map((result, i) => {
    const entry = resolved.cascade[i]!;
    return {
      provider: entry.provider,
      modelId: entry.modelId,
      ok: result.ok,
      ...(result.status === undefined ? {} : { status: result.status }),
      ...(result.message === undefined ? {} : { message: result.message }),
    };
  });

  // Pick the first healthy provider in cascade order
  for (let i = 0; i < resolved.cascade.length; i++) {
    const entry = resolved.cascade[i]!;
    const result = probeResults[i]!;
    if (!result.ok || isUnusableGemini(entry.modelId, result.message)) {
      console.warn(
        `[Wab AI] provider ${entry.provider}/${entry.modelId} rejected the probe:`,
        result.message,
      );
      continue;
    }
    return {
      model: {
        provider: entry.provider,
        modelId: entry.modelId,
        model: entry.model,
        providerOptions: entry.providerOptions,
        cascade: resolved.cascade,
        attempts,
      },
      attempts,
    };
  }

  return { model: null, attempts };
}

/** One-line operator-facing reason for a failed probe run. */
export function describeAttempts(attempts: ProviderAttempt[]): string {
  if (attempts.length === 0) {
    return "No AI provider key is configured. Add GEMINI_API_KEY (or OPENAI_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY) to your environment and redeploy.";
  }
  return attempts
    .map(
      (a) =>
        `${a.provider}/${a.modelId}: ${a.status ? `HTTP ${a.status} — ` : ""}${a.message ?? "failed"}`,
    )
    .join(" • ");
}

/** Friendly message for gateway failures (credits, rate limit, etc). */
export function describeAiError(e: unknown): { status: number; message: string } {
  const status =
    (e as { statusCode?: number })?.statusCode ?? (e as { status?: number })?.status ?? 500;
  if (status === 402)
    return {
      status,
      message: "AI credits are used up. Add credits in your workspace settings to continue.",
    };
  if (status === 429)
    return { status, message: "Wab AI is busy right now. Please try again in a moment." };
  if (status === 403) return { status, message: "AI access is blocked for this workspace." };
  return { status, message: "Wab AI is temporarily unavailable. Your data was not changed." };
}

export function isProviderError(e: unknown): boolean {
  const s =
    (e as { statusCode?: number; status?: number })?.statusCode ??
    (e as { status?: number })?.status;
  return isCapacityError(e) || s === 429 || (typeof s === "number" && s >= 500);
}
export const isQuotaError = isProviderError;
