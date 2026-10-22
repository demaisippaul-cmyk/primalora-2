// Foundable AI kit: an AI feature's route on the server. Foundable keeps this file and replaces it whole when the kit
// changes, so never edit it. A feature's own folder, src/ai/<id>/, holds what is its own: its file (feature.json, which
// Build writes from the owner's plan), its instructions, its tools and its page context, which it hands to aiFeature:
//
//   export const respond = aiFeature(feature, { instructions, tools, context }); // feature: src/ai/<id>/feature.json?raw
//
// and its route, src/routes/api/ai/<id>.ts, answers GET, POST and DELETE with
// `async ({ request }) => (await import(<that module>)).respond(request)`. A request carries only the visitor's words, their
// Confirm or Cancel and the page's ids: the model, the instructions, the tools and every limit come from the feature's
// file, its folder and this kit.
import { APICallError, RetryError, ToolLoopAgent, createAgentUIStreamResponse, isStepCount, safeValidateUIMessages, type OutputInterface,
  type ToolSet, type UIMessage } from "ai";
// TanStack Start's types, which give every route's createFileRoute its server handlers; types only, nothing loads at run time.
import type {} from "@tanstack/react-start";
import { aiVisitorMessage, model } from "../ai.server";
import { clearConversation, loadConversation, newest, pressedMessage, questionMessage, saveConversation, saveConversationIfUnchanged,
  textMessages, withDecisions, withQuestion } from "./conversations.server";
import { aiFeatureKindLimits, aiStreamKeepAliveMs, aiTurnBodyBytes, aiTurnWords, readAiTurnRequest, type AiConversation,
  type AiFeatureKind, type AiPage, type AiRefusal } from "./turn";
import { visitorOf, type Visitor } from "./visitor.server";
import { webSearch, type WebSearchOptions } from "./web-search.server";

export type { AiPage, Visitor, WebSearchOptions };

/** What a feature's folder hands the kit. */
export interface AiFeatureSetup {
  /** What the feature does and how it answers, for this website; the kit adds today's date and whether the visitor is signed in. */
  instructions: string;
  /**
   * Its tools, made for each request with that request's visitor, whose `db` is the website's database as them. A tool the
   * feature's file lists as a read runs when the model calls it; every other waits for the visitor's yes. A tool on the
   * visitor's own data, or one reading the business's records, is offered only while they are signed in. Nothing is kept
   * for an anonymous visitor, or for a signed-in one where the feature keeps no conversation, so their yes runs the change
   * their page sends, with no model between: such a feature's change tools may do only what that visitor may do under the
   * database's rules (an anonymous request the owner reviews), never a privileged action (an email, a payment, a server
   * function), which needs a signed-in visitor and a kept conversation.
   */
  tools?: (visitor: Visitor) => ToolSet;
  /**
   * An extractor's or a classifier's typed answer (`Output.object`, `Output.choice`): every field required, a maybe one
   * `.nullable()`. It streams as every answer does, so its route never waits for the model before answering.
   */
  output?: OutputInterface;
  /** One line on what the visitor is looking at, read by the page's ids as the visitor, never from the page's own text. */
  context?: (visitor: Visitor, page: AiPage) => string | undefined | Promise<string | undefined>;
  /**
   * How the feature narrows its web searches, from its job (only some sites, only recent pages, one country's first). A
   * feature whose file knows the web gets the kit's "web_search" tool, which searches the whole web without it; any other
   * gets none.
   */
  webSearch?: WebSearchOptions;
}

/** What the kit reads of a feature's file, by its shape alone. */
interface Feature {
  id: string;
  kind: AiFeatureKind;
  audience: string;
  model: string;
  memory: string;
  tools: Array<{ name: string; access: string; whose: string }>;
  /** What it answers from besides its tools: the web among them gives it the kit's web search. */
  knows: string[];
}
/**
 * The words of a feature's file the kit acts on: anyone may use it, a tool that only reads, the visitor's own data, the
 * business's own records, no memory.
 */
const anyone = "visitors", reads = "read", visitorsOwn = "visitor", businesses = "business", noMemory = "none";
/** What a feature's file says when it knows the web, and the tool the kit gives it for that. */
const theWeb = "web", webSearchTool = "web_search";

/** The visitor's sentence in place of an answer, with its status. */
const refuse = (status: number, error: string) => Response.json({ error } satisfies AiRefusal, { status });
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A failed call's sentence for the visitor, and one line for the website's log first: the provider's status and the code
 * it named (Foundable AI's own refusals among them), each null where the failure had none. Build's verify reads that line
 * to tell Foundable AI refusing a try from the feature failing, since the visitor's sentence reads the same for both.
 */
function failed(error: unknown): string {
  const failure = RetryError.isInstance(error) ? error.lastError : error;
  const call = APICallError.isInstance(failure) ? failure : null;
  const code = (call?.data as { error?: { code?: unknown } } | undefined)?.error?.code;
  console.error("Foundable AI: the call failed " + JSON.stringify({ status: call?.statusCode ?? null, code: typeof code === "string" ? code : null }));
  return aiVisitorMessage(error);
}

/**
 * A feature's route: POST asks it (a stream of the answer, which opens at once whatever the feature's kind, since a live
 * preview's door gives up on an answer not begun in 55 s, or a refusal's sentence), GET answers a signed-in visitor's
 * conversation with it and DELETE clears that. Every failure is a sentence for the visitor; its cause goes to the website's log.
 */
export function aiFeature(definition: string, setup: AiFeatureSetup): (request: Request) => Promise<Response> {
  const feature = readFeature(definition);
  return async request => {
    if (!feature) {
      console.error("Foundable AI: this feature's file is not one the kit reads.");
      return refuse(500, aiTurnWords.notReady);
    }
    try {
      if (request.method === "POST") return await answer(feature, setup, request);
      if (request.method === "GET" || request.method === "DELETE") return await conversation(feature, request);
      return refuse(405, aiTurnWords.method);
    } catch (error) {
      console.error("Foundable AI:", error);
      return refuse(503, failed(error));
    }
  };
}

async function answer(feature: Feature, setup: AiFeatureSetup, request: Request): Promise<Response> {
  const limits = aiFeatureKindLimits[feature.kind];
  const text = await bodyOf(request);
  if (text === null) return refuse(413, aiTurnWords.tooBig);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return refuse(400, aiTurnWords.malformed); }
  const visitor = await visitorOf(request);
  if (!visitor) return refuse(401, aiTurnWords.signInAgain);
  if (feature.audience !== anyone && visitor.userId === null) return refuse(401, aiTurnWords.signIn);
  // A feature that keeps a conversation carries its newest earlier messages with each request; any other carries none.
  const earlier = feature.memory === noMemory ? 0 : limits.historyMessages;
  const read = readAiTurnRequest(body, { messageCharacters: limits.messageCharacters, historyMessages: earlier, signedIn: visitor.userId !== null });
  if ("refusal" in read) return refuse(read.refusal.status, read.refusal.error);
  const { turn } = read;
  const turnId = crypto.randomUUID(), web = feature.knows.includes(theWeb);
  // A feature that knows the web searches it with the kit's tool, a read that any visitor may run, made for this turn.
  const own = setup.tools?.(visitor) ?? {};
  const tools = offered(feature, web ? { ...own, [webSearchTool]: webSearch(feature.id, turnId, setup.webSearch) } : own, visitor);
  const free = new Set([...feature.tools.filter(tool => tool.access === reads).map(tool => tool.name), ...web ? [webSearchTool] : []]);
  // A signed-in visitor's conversation is their own row; an anonymous visitor's comes from their browser, words alone.
  const store = earlier > 0 && visitor.userId !== null ? visitor.db : null;
  let messages: UIMessage[], readAt: string | null = null;
  if (store) {
    const saved = await savedConversation(store, feature.id, tools);
    const next = "question" in turn ? withQuestion(saved.messages, turn.question) : withDecisions(saved.messages, turn.press);
    if (!next) return refuse(409, aiTurnWords.movedOn);
    messages = next;
    readAt = saved.updatedAt;
  } else if ("question" in turn) messages = [...textMessages(turn.history), questionMessage(turn.question)];
  else {
    // Nothing is kept for this visitor, so their press names the changes it confirms: each must be one of the feature's
    // tools that waits for a yes, its input is checked against that tool's below, and it runs as this visitor alone.
    if (turn.press.parts.some(part => part.type === "confirmation" && (free.has(part.toolName) || !Object.hasOwn(tools, part.toolName))))
      return refuse(400, aiTurnWords.malformed);
    messages = [...textMessages(turn.history), pressedMessage(turn.press)];
  }
  const checked = await safeValidateUIMessages({ messages: newest(messages, earlier, aiTurnBodyBytes), tools });
  if (!checked.success) return refuse(400, aiTurnWords.malformed);
  messages = checked.data;
  // The visitor's message, or their decision, is kept before any model call, so an answer cut short never loses it. A
  // decision is kept only over the conversation it was read from, so a change two presses both confirm runs once.
  if (store && "question" in turn) await saveConversation(store, feature.id, messages);
  else if (store && (!readAt || !await saveConversationIfUnchanged(store, feature.id, messages, readAt))) return refuse(409, aiTurnWords.movedOn);
  const lastStep = limits.steps - 1, answering = Object.keys(tools).length > 0;
  const agent = new ToolLoopAgent({
    model: model(feature.model, visitor.userId),
    instructions: [setup.instructions, facts(visitor), await pageLine(setup, visitor, turn.page)].filter(Boolean).join("\n\n"),
    tools,
    // Only a tool the feature's file lists as a read runs without the visitor's yes.
    toolApproval: ({ toolCall }) => free.has(toolCall.toolName) && !toolCall.dynamic ? "not-applicable" : "user-approval",
    stopWhen: isStepCount(limits.steps),
    // The last step the limit allows answers in words, so a turn never ends on a tool call.
    ...(answering ? { prepareStep: ({ stepNumber }: { stepNumber: number }) => stepNumber >= lastStep ? { toolChoice: "none" as const } : undefined } : {}),
    maxOutputTokens: limits.outputTokens,
    ...(setup.output ? { output: setup.output } : {}),
    headers: { ["x-app-ai-feature"]: feature.id, ["x-app-ai-turn"]: turnId },
    providerOptions: { openai: { promptCacheKey: feature.id, reasoningEffort: "low" } },
  });
  return createAgentUIStreamResponse({
    agent, uiMessages: messages, originalMessages: messages,
    generateMessageId: () => crypto.randomUUID(),
    // The model's reasoning stays out of the browser and the saved conversation: it can restate the instructions and tool results.
    sendReasoning: false,
    // The answer opens at once with an SSE comment and says it is still there each `aiStreamKeepAliveMs` it is silent, so neither
    // a live preview's door nor a load balancer cuts it while the model thinks or a tool runs.
    keepAliveMs: aiStreamKeepAliveMs,
    onError: failed,
    onEnd: async ({ messages: answered }) => {
      if (!store) return;
      try { await saveConversation(store, feature.id, newest(answered, earlier - 1, aiTurnBodyBytes)); }
      catch (error) { console.error("Foundable AI:", error); }
    },
  });
}

/** GET answers a signed-in visitor's conversation with the feature; DELETE clears it. */
async function conversation(feature: Feature, request: Request): Promise<Response> {
  const visitor = await visitorOf(request);
  if (!visitor) return refuse(401, aiTurnWords.signInAgain);
  if (visitor.userId === null || !visitor.db) return refuse(401, aiTurnWords.signIn);
  const keeps = feature.memory !== noMemory && aiFeatureKindLimits[feature.kind].historyMessages > 0;
  if (request.method === "DELETE") {
    if (keeps) await clearConversation(visitor.db, feature.id);
    return new Response(null, { status: 204 });
  }
  const messages = keeps ? (await loadConversation(visitor.db, feature.id)).messages : [];
  return Response.json({ messages: messages as UIMessage[] } satisfies AiConversation);
}

/**
 * The visitor's saved conversation, checked against the feature's tools, and when it was kept; one its tools no longer read
 * starts afresh.
 */
async function savedConversation(db: NonNullable<Visitor["db"]>, feature: string, tools: ToolSet):
  Promise<{ messages: UIMessage[]; updatedAt: string | null }> {
  const { messages, updatedAt } = await loadConversation(db, feature);
  if (!messages.length) return { messages: [], updatedAt };
  const checked = await safeValidateUIMessages({ messages, tools });
  if (checked.success) return { messages: checked.data, updatedAt };
  console.error("Foundable AI: a saved conversation no longer fits this feature's tools, so it starts again.", checked.error);
  return { messages: [], updatedAt };
}

/**
 * The tools this visitor is offered: one on the visitor's own data, or one reading the business's records, only while they
 * are signed in.
 */
function offered(feature: Feature, tools: ToolSet, visitor: Visitor): ToolSet {
  if (visitor.userId !== null) return tools;
  const signedIn = new Set(feature.tools.filter(tool => tool.whose === visitorsOwn || tool.access === reads && tool.whose === businesses)
    .map(tool => tool.name));
  return Object.fromEntries(Object.entries(tools).filter(([name]) => !signedIn.has(name)));
}

/** What the model is told every turn, after the feature's own instructions so those stay a cached prefix. */
function facts(visitor: Visitor): string {
  return [`Today is ${new Date().toISOString().slice(0, 10)}.`,
    visitor.userId === null ? "The visitor is not signed in." : "The visitor is signed in.",
    "A change waits for the visitor's yes; when they do not give it, never try that change again."].join(" ");
}

/** The feature's line on the visitor's page, or none when it has none or cannot read it, which never stops the answer. */
async function pageLine(setup: AiFeatureSetup, visitor: Visitor, page: AiPage): Promise<string | undefined> {
  if (!setup.context || !Object.keys(page).length) return undefined;
  try { return (await setup.context(visitor, page)) || undefined; }
  catch (error) {
    console.error("Foundable AI: the page's context could not be read.", error);
    return undefined;
  }
}

/** The request's body as text, or null past `aiTurnBodyBytes`, where it stops reading. */
async function bodyOf(request: Request): Promise<string | null> {
  if (Number(request.headers.get("content-length")) > aiTurnBodyBytes) return null;
  if (!request.body) return "";
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > aiTurnBodyBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** A feature's file as the kit reads it: its shape alone, a kind the kit has limits for; one naming nothing it knows knows nothing. */
function readFeature(text: string): Feature | null {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (!record(value) || typeof value.id !== "string" || typeof value.kind !== "string" || !Object.hasOwn(aiFeatureKindLimits, value.kind)
    || typeof value.audience !== "string" || typeof value.model !== "string" || typeof value.memory !== "string"
    || !Array.isArray(value.tools) || (value.knows !== undefined && !Array.isArray(value.knows))) return null;
  const tools: Feature["tools"] = [];
  for (const tool of value.tools as unknown[]) {
    if (!record(tool) || typeof tool.name !== "string" || typeof tool.access !== "string" || typeof tool.whose !== "string") return null;
    tools.push({ name: tool.name, access: tool.access, whose: tool.whose });
  }
  const knows = ((value.knows ?? []) as unknown[]).filter((source): source is string => typeof source === "string");
  return { id: value.id, kind: value.kind as AiFeatureKind, audience: value.audience, model: value.model, memory: value.memory, tools, knows };
}
