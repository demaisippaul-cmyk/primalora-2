// Foundable AI kit: what an AI feature's route takes and answers, shared by the route (feature.server.ts) and the page's
// chat. Foundable keeps this file and replaces it whole when the kit changes, so never edit it. It holds no secret and runs
// in the browser as well as on the server.
import type { UIMessage } from "ai";

/** Each kind of feature's limits, Foundable AI's own: the route holds every request to its feature's. */
export const aiFeatureKindLimits = {
  "assistant": {
    "steps": 6,
    "outputTokens": 4000,
    "messageCharacters": 2000,
    "historyMessages": 20
  },
  "generator": {
    "steps": 6,
    "outputTokens": 8000,
    "messageCharacters": 2000,
    "historyMessages": 0
  },
  "extractor": {
    "steps": 6,
    "outputTokens": 2000,
    "messageCharacters": 20000,
    "historyMessages": 0
  },
  "classifier": {
    "steps": 6,
    "outputTokens": 2000,
    "messageCharacters": 20000,
    "historyMessages": 0
  },
  "search": {
    "steps": 1,
    "outputTokens": 0,
    "messageCharacters": 2000,
    "historyMessages": 0
  }
} as const;
export type AiFeatureKind = keyof typeof aiFeatureKindLimits;

/** The most a request's body may be, in bytes; a bigger one is refused before it is read. */
export const aiTurnBodyBytes = 131_072;

/**
 * How long a streamed answer goes without a byte before the route says it is still there, in milliseconds: an SSE comment,
 * which the page's chat never reads as part of the answer. A live preview's door cuts a connection silent for a minute, so a
 * model thinking or a tool running long never reads as a dead connection (Miguel's sitting, 2026-10-07).
 */
export const aiStreamKeepAliveMs = 15_000;

/** What a page may tell a feature about itself (its path and the ids of what it shows), within these bounds. */
export const aiPageLimits = { entries: 8, valueCharacters: 200 } as const;
/** A page entry's name. */
export const aiPageKey = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

/**
 * The header a signed-in visitor's page sends their sign-in in, their backend access token (supabase-js's
 * `session.access_token`); a request without it is anonymous. Never Authorization, which a live preview replaces with its own.
 */
export const aiVisitorTokenHeader = "x-visitor-token";

/** A feature's route: POST asks it, GET reads a signed-in visitor's conversation with it, DELETE clears that. */
export function aiFeaturePath(featureId: string): string {
  return "/api/ai/" + featureId;
}

/** The page's own ids and path, as strings; the route never reads them as instructions. */
export type AiPage = Record<string, string>;
/**
 * One earlier message of an anonymous visitor's conversation, which stays in their browser: its words alone, of which the
 * route reads no more than the feature's message limit.
 */
export interface AiTextTurn {
  id: string;
  role: "user" | "assistant";
  parts: Array<{ type: "text"; text: string }>;
}
/**
 * A request to a feature's route, sent with `aiVisitorTokenHeader` only while the visitor is signed in: `message` is the
 * visitor's new message (its words alone), or the assistant message their Confirm or Cancel answered; `history`, only
 * without a token, is the earlier messages an anonymous visitor's browser keeps.
 */
export interface AiTurnRequest {
  message: UIMessage;
  history?: AiTextTurn[];
  page?: AiPage;
}
/** What the route answers in place of an answer it will not give: a sentence for the visitor, shown where the answer would be. */
export interface AiRefusal {
  error: string;
}
/** A signed-in visitor's conversation with a feature, as the route's GET answers it. */
export interface AiConversation {
  messages: UIMessage[];
}

/** What a visitor reads when the route refuses a request. */
export const aiTurnWords = {
  malformed: "Something went wrong sending that. Please try again.",
  tooLong: "That message is too long. Please send a shorter one.",
  tooBig: "This conversation is too long to continue. Please start a new one.",
  signIn: "Please sign in to use this.",
  signInAgain: "Please sign in again to continue.",
  movedOn: "This conversation changed somewhere else. Please reload the page.",
  method: "This feature does not take that request.",
  notReady: "This feature isn't ready yet. Please try again later.",
} as const;

/** What the model and the visitor read of a change its confirmation left unmade or unknown. */
export const aiChangeWords = {
  /** A change nobody confirmed before the conversation moved on. */
  notConfirmed: "The visitor did not confirm this change, so it was not made.",
  /** A confirmed change whose answer was lost before its result was kept: it may have run, so it never runs again. */
  unknownResult: "This change may have gone through, but its result was lost. Check before trying it again.",
} as const;

/** The visitor's new message. */
export interface AiQuestion {
  id: string;
  text: string;
}
/** The visitor's answer to one confirmation: the change it confirms, as the assistant message they answered names it. */
export interface AiConfirmation {
  type: "confirmation";
  toolName: string;
  toolCallId: string;
  input: unknown;
  approvalId: string;
  approved: boolean;
  reason?: string;
}
/** A Confirm or Cancel press: the assistant message it answers, by its words and the changes it confirms, in their order. */
export interface AiPress {
  messageId: string;
  parts: Array<{ type: "text"; text: string } | AiConfirmation>;
}
export type AiTurn =
  | { question: AiQuestion; history: AiTextTurn[]; page: AiPage }
  | { press: AiPress; history: AiTextTurn[]; page: AiPage };

const messageId = /^[A-Za-z0-9_-]{1,64}$/;
const reasonCharacters = 500;
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const only = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key));
const textPart = (value: unknown): value is { type: "text"; text: string } => record(value) && value.type === "text" && typeof value.text === "string";
/** A message's words, its text parts a line apart, as the limit on a message counts them. */
const textOf = (parts: readonly { text: string }[]) => parts.map(part => part.text).join("\n");
/** Words cut to `characters`, a character the cut would split left out whole. */
const cut = (text: string, characters: number) => {
  const last = text.charCodeAt(characters - 1);
  return text.slice(0, last >= 0xd800 && last <= 0xdbff ? characters - 1 : characters);
};

/**
 * The route's reading of a request, which takes the visitor's words, their decisions and the page's ids and nothing else:
 * a model, instructions, tools, sizes, earlier answers for a signed-in visitor and any other part are never read from it.
 * A new message is text alone, within the feature's message limit; a press is the decisions in an assistant message's
 * answered confirmations (`approval-responded`), the rest of that message left out but its words; an anonymous visitor's
 * history is text alone, its newest `historyMessages` kept, each cut to the message limit rather than refused, since an
 * answer runs past it; a page has at most `aiPageLimits.entries` bounded strings.
 */
export function readAiTurnRequest(body: unknown, rules: { messageCharacters: number; historyMessages: number; signedIn: boolean }):
  { turn: AiTurn } | { refusal: { status: 400 | 413; error: string } } {
  const refused = (status: 400 | 413 = 400, error: string = aiTurnWords.malformed) => ({ refusal: { status, error } });
  if (!record(body) || !only(body, ["message", "history", "page"]) || rules.signedIn && body.history !== undefined) return refused();
  const page = readPage(body.page), history = readHistory(body.history, rules);
  const message = body.message;
  if (!page || !history || !record(message) || typeof message.id !== "string" || !messageId.test(message.id)
    || !Array.isArray(message.parts)) return refused();
  if (message.role === "user") {
    if (!message.parts.length || !message.parts.every(textPart)) return refused();
    const text = textOf(message.parts);
    if (!text.trim()) return refused();
    if (text.length > rules.messageCharacters) return refused(413, aiTurnWords.tooLong);
    return { turn: { question: { id: message.id, text }, history, page } };
  }
  if (message.role !== "assistant") return refused();
  const parts: AiPress["parts"] = [], approvals = new Set<string>();
  for (const part of message.parts as unknown[]) {
    if (textPart(part)) parts.push({ type: "text", text: part.text });
    if (!record(part) || typeof part.type !== "string" || !part.type.startsWith("tool-") || part.state !== "approval-responded") continue;
    const approval = part.approval;
    if (part.type.length <= 5 || typeof part.toolCallId !== "string" || !record(approval) || typeof approval.id !== "string"
      || typeof approval.approved !== "boolean" || approvals.has(approval.id)
      || approval.reason !== undefined && (typeof approval.reason !== "string" || approval.reason.length > reasonCharacters)) return refused();
    approvals.add(approval.id);
    parts.push({ type: "confirmation", toolName: part.type.slice(5), toolCallId: part.toolCallId, input: part.input,
      approvalId: approval.id, approved: approval.approved, ...(approval.reason === undefined ? {} : { reason: approval.reason }) });
  }
  if (!approvals.size) return refused();
  return { turn: { press: { messageId: message.id, parts }, history, page } };
}

function readPage(value: unknown): AiPage | null {
  if (value === undefined) return {};
  if (!record(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > aiPageLimits.entries) return null;
  const page: AiPage = {};
  for (const [key, entry] of entries) {
    if (!aiPageKey.test(key) || typeof entry !== "string" || entry.length > aiPageLimits.valueCharacters) return null;
    page[key] = entry;
  }
  return page;
}

/**
 * An anonymous visitor's earlier messages, by their shape: text alone, the newest `historyMessages`, each read as its words
 * cut to `messageCharacters` where they run past it, so a history costs at most that many messages of that many characters.
 */
function readHistory(value: unknown, rules: { historyMessages: number; messageCharacters: number }): AiTextTurn[] | null {
  if (value === undefined || rules.historyMessages <= 0) return [];
  if (!Array.isArray(value)) return null;
  const turns: AiTextTurn[] = [];
  for (const turn of value.slice(-rules.historyMessages) as unknown[]) {
    if (!record(turn) || !only(turn, ["id", "role", "parts"]) || typeof turn.id !== "string" || !messageId.test(turn.id)
      || turn.role !== "user" && turn.role !== "assistant" || !Array.isArray(turn.parts) || !turn.parts.length) return null;
    const parts: AiTextTurn["parts"] = [];
    for (const part of turn.parts as unknown[]) {
      if (!textPart(part) || !only(part, ["type", "text"])) return null;
      parts.push({ type: "text", text: part.text });
    }
    const words = textOf(parts);
    turns.push({ id: turn.id, role: turn.role,
      parts: words.length > rules.messageCharacters ? [{ type: "text", text: cut(words, rules.messageCharacters) }] : parts });
  }
  return turns;
}
