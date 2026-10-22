// Foundable AI: the models this app's server code calls. Foundable sets OPENAI_BASE_URL and OPENAI_API_KEY for the
// published app and the owner's credits pay for each call, so the app needs no key of its own. Import this file only
// from server code, and never edit it: Build writes it, and replaces it whole when it changes.
import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, RetryError, defaultSettingsMiddleware, wrapLanguageModel } from "ai";

// Both names are read as a call is made, never as this module loads: their values arrive with each request.
function provider() {
  return createOpenAI({ baseURL: process.env.OPENAI_BASE_URL, apiKey: process.env.OPENAI_API_KEY });
}

// Whether calls go through Foundable AI, which runs "default" on the model this website's owner picked; a key of
// the owner's own reaches OpenAI, which knows no such name.
function viaFoundable() {
  return process.env.OPENAI_BASE_URL?.endsWith("/api/app-ai/openai/v1") === true;
}

/**
 * A model on OpenAI's Responses API, which runs tools at every reasoning effort: "default" for this website's model,
 * which its owner picks and changes with no rebuild, or a model Foundable AI serves by its name. Nothing is stored at OpenAI
 * (store: false), so each call carries the whole conversation, its tool calls and its reasoning, which every later step of a
 * tool loop and every later turn of a chat needs. It reasons at low effort unless a call's
 * providerOptions.openai.reasoningEffort asks for more, and passes the signed-in user's id, when there is one, as OpenAI's
 * safety identifier.
 */
export function model(id: string, userId?: string | null) {
  const named = id === "default" && !viaFoundable() ? "gpt-6-luna" : id;
  // The AI SDK knows only OpenAI's names, so it is told the website's model reasons, as every model it may be does.
  const openai = { store: false, reasoningEffort: "low", ...(named === "default" ? { forceReasoning: true } : {}),
    ...(userId ? { safetyIdentifier: userId } : {}) };
  return wrapLanguageModel({ model: provider().responses(named),
    middleware: defaultSettingsMiddleware({ settings: { providerOptions: { openai } } }) });
}

/** Most AI features, on this website's model: chat replies, writing, summaries and extraction. Pass the signed-in user's id when there is one. */
export function fast(userId?: string | null) {
  return model("default", userId);
}

/** Harder reasoning and longer answers, on a stronger model whatever this website's model. Pass the signed-in user's id when there is one. */
export function smart(userId?: string | null) {
  return model("gpt-6.1-sol", userId);
}

/** Embeddings, for search by meaning. */
export function embedding() {
  return provider().embedding("text-embedding-3-small");
}

/** What a visitor reads when no answer came and nothing more particular applies. */
const unavailable = "This feature isn't available right now. Please try again in a moment.";

/**
 * What a visitor reads where the answer would be, for every failure, so no page waits on an answer that failed:
 * Foundable's own words when AI is paused, a sentence of its own when the request is too big (for the day's limit, the
 * body cap or the model's context window) or callers crowd in (after the SDK's own retries), and `unavailable` for anything
 * else, a failure with no status among them (a lost connection, or a stream that broke after it began).
 */
export function aiVisitorMessage(error: unknown): string {
  const failure = RetryError.isInstance(error) ? error.lastError : error;
  if (!APICallError.isInstance(failure)) return unavailable;
  const refusal = (failure.data as { error?: { code?: unknown } } | undefined)?.error;
  if (refusal?.code === "app_ai_call_too_big" || refusal?.code === "context_length_exceeded" || failure.statusCode === 413)
    return "This request is too big for this site's AI. Please try a shorter one.";
  if (failure.statusCode === 402) return "This feature is taking a short break. Please try again later.";
  if (failure.statusCode === 429) return "Lots of people are asking right now. Please try again in a moment.";
  return unavailable;
}
