// Foundable AI's chat, the browser half of an assistant: the visitor's words go to its route with their sign-in, and its
// answer, the changes it asks the visitor to confirm and its failures come back to show. Build writes this file and replaces
// it whole when it changes, so never edit it: give the chat the website's look with className and the data-ai-* attributes.
import { Chat, useChat } from "@ai-sdk/react";
import { APICallError, DefaultChatTransport, getToolName, isTextUIPart, isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses, type DynamicToolUIPart, type ToolUIPart, type UIMessage } from "ai";
import { Fragment, useEffect, useMemo, type ReactNode } from "react";
import { aiChangeWords, aiFeatureKindLimits, aiFeaturePath, aiPageKey, aiPageLimits, aiTurnBodyBytes, aiTurnWords, aiVisitorTokenHeader,
  type AiConversation, type AiPage, type AiRefusal, type AiTextTurn, type AiTurnRequest } from "./turn";

/** The website's backend client (src/lib/backend.ts), whose session says who is signed in. */
export interface AiVisitorSessions {
  auth: { getSession(): Promise<{ data: { session: { access_token: string } | null } }> };
}

export interface AiChatOptions {
  /** The website's backend client: a signed-in visitor's questions then carry their sign-in, and the website keeps their conversation. */
  backend?: AiVisitorSessions;
  /** What the page shows, by id ({ productId: product.id }), so "this one" means it. Never text: the server reads each item itself. */
  page?: AiPage;
}

/** A tool's step in an answer, as the AI SDK names it. */
export type AiToolPart = ToolUIPart | DynamicToolUIPart;

/** What the chat's look needs: the conversation, its state and what the visitor can do. */
export interface AiChat {
  /**
   * The conversation, oldest first: show it with AiMessages, or draw each message in an element marked
   * data-ai-message={message.role}, with its parts in AiText and AiConfirm, and mark the element showing errorText
   * data-ai-error, as AiMessages does: Build's verify reads an answer by those marks.
   */
  messages: UIMessage[];
  /** An answer is on its way: disable sending and show that the assistant is working. */
  busy: boolean;
  /** Why no answer came, as a sentence for the visitor, to show where the answer would be; null otherwise. */
  errorText: string | null;
  /** Sends the visitor's words, unless they are blank or an answer is on its way; done once the answer came or failed. */
  send(text: string): Promise<void>;
  /** Stops the answer on its way, keeping what came so far. */
  stop(): Promise<void>;
  /** Asks again after a failure; done once the answer came or failed. */
  retry(): Promise<void>;
  /**
   * The visitor's answer to a change the assistant's last answer asks to make: nothing changes without their yes. A change an
   * earlier answer asked for is ignored, since the conversation moved on and the website declined it.
   */
  confirm(approvalId: string, approved: boolean): Promise<void>;
  /** Starts a new conversation, forgetting this one here and, for a signed-in visitor, on the website. */
  clear(): Promise<void>;
}

/** An assistant's chat outside React: what useAiChat runs on, and one chat several components can share (useAiChat(store)). */
export interface AiChatStore extends Omit<AiChat, "messages" | "busy" | "errorText"> {
  /** The AI SDK's chat the conversation runs on. */
  readonly chat: Chat<UIMessage>;
  /** The visitor's sign-in and the page, read as each question goes: set them again whenever they change. */
  options: AiChatOptions;
  /** Shows the conversation kept so far, once: the website's for a signed-in visitor, this browser's otherwise. */
  load(): Promise<void>;
  /** AiChat's errorText, read from the chat as it is now. */
  errorText(): string | null;
}

/** What the visitor reads when the website sent no sentence of its own. */
const disconnected = "The connection was lost. Please check it and try again.";
const unavailable = "Something went wrong. Please try again.";
const unanswered = "No answer came. Please try again.";
/** The most messages a browser keeps of an anonymous visitor's conversation. */
const keptMessages = 100;

/**
 * An assistant's chat, by its feature id. A signed-in visitor's conversation is the website's: read when the chat first
 * shows, and never kept in this browser or sent back as history. An anonymous visitor's stays in this browser, and each
 * question carries its earlier words, the last turns that fit. Every question carries the page's ids and path.
 */
export function createAiChatStore(feature: string, options: AiChatOptions = {}): AiChatStore {
  // Once a question or a read carried a sign-in, the conversation is the website's.
  let signedIn = false;
  let sending = false;
  let loaded = false;
  // Questions the route refused before answering stay on screen beside the reason, but were never part of the conversation:
  // they are never sent back as history or kept in this browser.
  const refused = new Set<string>();
  let asking: string | null = null;
  let pressing = false;
  // The last answer once a change confirmed in it lost its answer (a tab closed while it ran, a connection that broke):
  // settled as the website's route settles one, since it may have run, it never runs again, and the visitor reads why.
  let lost: string | null = null;
  const settleLost = (messages: UIMessage[]): UIMessage[] => {
    const last = messages[messages.length - 1];
    if (last?.role !== "assistant" || !last.parts.some(confirmedWithoutResult)) return messages;
    lost = last.id;
    const parts = last.parts.map(part => confirmedWithoutResult(part)
      ? { ...part, state: "output-error", errorText: aiChangeWords.unknownResult } as AiToolPart : part);
    return [...messages.slice(0, -1), { ...last, parts }];
  };
  /** Keeps an anonymous visitor's conversation in this browser, less the questions the route refused. */
  const keepHere = (messages: UIMessage[]) => {
    if (!signedIn) keep(feature, messages.filter(message => !refused.has(message.id)));
  };
  const reread = async () => {
    const token = await accessToken(store.options.backend);
    if (token) chat.messages = settleLost(await savedConversation(feature, token));
    else signedIn = false;
  };
  const chat: Chat<UIMessage> = new Chat<UIMessage>({
    id: `foundable-ai-${feature}`,
    transport: new DefaultChatTransport<UIMessage>({
      api: aiFeaturePath(feature),
      prepareSendMessagesRequest: async ({ messages }) => {
        asking = null;
        pressing = false;
        const token = await accessToken(store.options.backend);
        // A sign-in that lapsed is said, never answered as a stranger's question; New conversation starts one as a stranger.
        if (!token && signedIn) throw new Error(aiTurnWords.signInAgain);
        if (token) signedIn = true;
        const message = messages[messages.length - 1]!;
        asking = message.role === "user" ? message.id : null;
        pressing = message.role === "assistant";
        refused.delete(message.id);
        const body: AiTurnRequest = { message, page: pageOf(store.options.page) };
        if (!signedIn) fitHistory(body, textTurns(messages.slice(0, -1).filter(earlier => !refused.has(earlier.id))));
        return { body, headers: token ? visitorHeaders(token) : {} };
      },
    }),
    // The visitor answered every change the assistant asked to make: their answers go at once.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: ({ messages }) => keepHere(messages),
    onError: error => {
      // A press whose answer broke off, which the route never refused, may have run its change: it is never sent again.
      if (!APICallError.isInstance(error)) {
        if (pressing) chat.messages = settleLost(chat.messages);
        return;
      }
      if (asking !== null) refused.add(asking);
      // Another tab moved a signed-in visitor's conversation on: show it as the website keeps it.
      if (signedIn && error.statusCode === 409) reread().catch(() => {});
    },
  });
  const busy = () => chat.status === "submitted" || chat.status === "streaming";
  const store: AiChatStore = {
    chat,
    options,
    async load() {
      if (loaded) return;
      loaded = true;
      const token = await accessToken(store.options.backend);
      if (token) signedIn = true;
      const saved = token ? await savedConversation(feature, token) : readKept(feature);
      if (saved.length && chat.messages.length === 0) chat.messages = settleLost(saved);
    },
    errorText() {
      const last = chat.messages[chat.messages.length - 1];
      if (lost !== null && last?.id === lost && !busy()) return aiChangeWords.unknownResult;
      if (chat.status === "error") return visitorSentence(chat.error);
      return chat.status === "ready" && last !== undefined && !answered(last) ? unanswered : null;
    },
    async send(text) {
      if (busy() || sending || !text.trim()) return;
      sending = true;
      try { await chat.sendMessage({ text }); } finally { sending = false; }
    },
    stop: () => chat.stop(),
    async retry() {
      if (busy() || sending || chat.messages.length === 0) return;
      // A press the route refused sends the visitor's answers again (one whose answer broke off was settled as lost).
      if (lastAssistantMessageIsCompleteWithApprovalResponses({ messages: chat.messages })) return chat.sendMessage();
      // Asking again redoes the last answer, so never once one of its tools ran: its change could be asked for, and run, twice.
      const last = chat.messages[chat.messages.length - 1]!;
      if (last.role === "assistant" && last.parts.some(toolRan)) return;
      await chat.regenerate();
    },
    async confirm(approvalId, approved) {
      // The SDK sends a press only once the last answer's changes are all answered, so a yes to an earlier one went nowhere.
      if (!waiting(chat.messages, approvalId)) return;
      await chat.addToolApprovalResponse({ id: approvalId, approved });
      // Kept at once, before the answer: a tab closed while the change runs never shows its card again for a second yes.
      keepHere(chat.messages);
    },
    async clear() {
      await chat.stop();
      chat.clearError();
      chat.messages = [];
      forget(feature);
      if (!signedIn) return;
      try {
        const token = await accessToken(store.options.backend);
        if (token) await fetch(aiFeaturePath(feature), { method: "DELETE", headers: visitorHeaders(token) });
        // What the website keeps now: nothing, unless the delete did not reach it.
        await reread();
      } catch { /* The next load shows what the website kept. */ }
    },
  };
  return store;
}

/** An assistant's chat for a component: by its feature id, or a chat several components share (createAiChatStore). */
export function useAiChat(chat: string | AiChatStore, options?: AiChatOptions): AiChat {
  const store = useMemo(() => typeof chat === "string" ? createAiChatStore(chat) : chat, [chat]);
  const { messages, status } = useChat({ chat: store.chat });
  // The sign-in and page the next question reads, set once a render commits: a render React discards (StrictMode's second
  // render, an interrupted concurrent one) changes nothing. Before the read below, which needs the sign-in.
  useEffect(() => { if (options) store.options = options; }, [store, options]);
  useEffect(() => {
    store.load().catch(() => { /* Nothing to show yet: the conversation starts empty. */ });
    // A chat this component made stops with it; a shared one is its maker's.
    return typeof chat === "string" ? () => { void store.stop(); } : undefined;
  }, [chat, store]);
  return {
    messages,
    busy: status === "submitted" || status === "streaming",
    errorText: store.errorText(),
    send: store.send,
    stop: store.stop,
    retry: store.retry,
    confirm: store.confirm,
    clear: store.clear,
  };
}

/**
 * The conversation as the visitor sees it: each message's text with AiText and each change it asks to make with AiConfirm,
 * a tool's other steps as `tools` shows them by the tool's name (its output-available part as the website's own cards), and
 * the reason no answer came where the answer would be.
 */
export function AiMessages({ chat, tools, className }: {
  chat: AiChat;
  tools?: Partial<Record<string, (part: AiToolPart) => ReactNode>>;
  className?: string;
}) {
  return (
    <div className={className} data-ai-messages="">
      {chat.messages.map(message => (
        <div key={message.id} data-ai-message={message.role}>
          {message.parts.map((part, index) => {
            if (isTextUIPart(part)) return <AiText key={index} text={part.text} />;
            if (!isToolUIPart(part)) return null;
            const shown = tools?.[getToolName(part)]?.(part) ?? null;
            return part.state === "approval-requested"
              ? <AiConfirm key={index} chat={chat} part={part}>{shown}</AiConfirm>
              : <Fragment key={index}>{shown}</Fragment>;
          })}
        </div>
      ))}
      {chat.errorText !== null && <p role="alert" data-ai-error="">{chat.errorText}</p>}
    </div>
  );
}

/**
 * A change the assistant asks to make, until the visitor answers: what it will send, field by field, and Confirm and Cancel.
 * `children` says what the change is ("Send this to the studio?"); the fields always show, so the visitor sees exactly what
 * goes. Only the last answer's changes wait for a yes: one an earlier answer asked for reads "Not confirmed.", since the
 * conversation moved on and the website declined it.
 */
export function AiConfirm({ chat, part, children, confirmLabel = "Confirm", cancelLabel = "Cancel" }: {
  chat: Pick<AiChat, "messages" | "confirm">;
  part: AiToolPart;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
}) {
  if (part.state !== "approval-requested") return null;
  const { id } = part.approval;
  if (!waiting(chat.messages, id)) return <p data-ai-unconfirmed="">Not confirmed.</p>;
  return (
    <div data-ai-confirm="">
      {children}
      <dl>
        {fields(part.input).map(([name, value]) => (
          <Fragment key={name}><dt>{name}</dt><dd>{value}</dd></Fragment>
        ))}
      </dl>
      <button type="button" data-ai-answer="confirm" onClick={() => chat.confirm(id, true)}>{confirmLabel}</button>
      <button type="button" data-ai-answer="cancel" onClick={() => chat.confirm(id, false)}>{cancelLabel}</button>
    </div>
  );
}

/**
 * An answer's text, in paragraphs, never as HTML and never with a picture: an answer can carry planted text, and a picture
 * loads by itself, sending whatever its address holds, so a picture's markdown shows only its words. A link to one of this
 * website's pages shows its words; a link anywhere else also shows where it goes, and opens without telling that site this
 * page's address.
 */
export function AiText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className} data-ai-text="">
      {text.split(/\n{2,}/u).filter(paragraph => paragraph.trim() !== "").map((paragraph, index) => (
        <p key={index}>
          {paragraph.split("\n").map((line, at) => <Fragment key={at}>{at > 0 && <br />}{inline(line)}</Fragment>)}
        </p>
      ))}
    </div>
  );
}

/** A picture's markdown, a link's, bold text, or a bare web address: each within one line and free of parentheses. */
const marks = /!\[([^\]\n]*)\]\(([^()\s]*)\)|\[([^\]\n]+)\]\(([^()\s]+)\)|\*\*([^*\n]+)\*\*|(https?:\/\/[^\s<>()[\]]+)/giu;

function inline(line: string): ReactNode[] {
  const shown: ReactNode[] = [];
  let at = 0;
  for (const match of line.matchAll(marks)) {
    const [whole, alt, , label, href, bold, address] = match;
    shown.push(line.slice(at, match.index));
    at = match.index + whole.length;
    if (alt !== undefined) shown.push(alt);
    else if (label !== undefined) shown.push(link(label, href!, shown.length));
    else if (bold !== undefined) shown.push(<strong key={shown.length}>{bold}</strong>);
    else {
      // A sentence's last mark is the sentence's, not the address's.
      const [, bare, after] = /^(.*?)([.,;:!?'"]*)$/u.exec(address!)!;
      shown.push(link(bare!, bare!, shown.length), after);
    }
  }
  shown.push(line.slice(at));
  return shown;
}

function link(label: string, href: string, key: number): ReactNode {
  // One of this website's pages: a path, never "//host" or "/\host", which browsers read as another site.
  if (/^\/(?![/\\])/u.test(href)) return <a key={key} href={href}>{label}</a>;
  if (!/^(?:https?:\/\/|mailto:|tel:)/iu.test(href)) return label;
  return <a key={key} href={href} target="_blank" rel="noopener noreferrer">{label === href ? href : `${label} (${href})`}</a>;
}

/** A change's input as the visitor reads it: each field's name in words and its value as text. */
function fields(input: unknown): [string, string][] {
  if (input === null || input === undefined) return [];
  if (typeof input !== "object" || Array.isArray(input)) return [["Value", valueText(input)]];
  return Object.entries(input).filter(([, value]) => value !== null && value !== undefined)
    .map(([name, value]) => [fieldName(name), valueText(value)]);
}

function fieldName(name: string): string {
  const words = name.replace(/([a-z0-9])([A-Z])/gu, "$1 $2").replace(/[_-]+/gu, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function valueText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value) && value.every(item => typeof item === "string" || typeof item === "number")) return value.join(", ");
  return JSON.stringify(value);
}

/** A failure's sentence: the website's own, else this file's for a lost connection or an answer that never came. */
function visitorSentence(error: Error | undefined): string {
  // The route refused before answering, with { error } in its body.
  if (APICallError.isInstance(error)) return refusalSentence(error.responseBody) ?? unavailable;
  if (error instanceof TypeError) return disconnected;
  // The answer's stream ended on its error part, whose text the website wrote for visitors.
  return error?.constructor === Error && error.message.trim() !== "" ? error.message : unavailable;
}

function refusalSentence(body: string | undefined): string | null {
  try {
    const { error } = JSON.parse(body ?? "") as Partial<AiRefusal>;
    return typeof error === "string" && error.trim() !== "" ? error : null;
  } catch {
    return null;
  }
}

/** Whether a message is an answer the visitor can see: words, or a tool's step. */
const answered = (message: UIMessage) => message.role === "assistant"
  && message.parts.some(part => (isTextUIPart(part) && part.text.trim() !== "") || isToolUIPart(part));

/** A tool's step that ran: its result, or its failure. */
const toolRan = (part: UIMessage["parts"][number]) =>
  isToolUIPart(part) && (part.state === "output-available" || part.state === "output-error");

/** A change the visitor confirmed that has no result yet: its press is on its way, or its answer was lost. */
const confirmedWithoutResult = (part: UIMessage["parts"][number]): part is AiToolPart =>
  isToolUIPart(part) && part.state === "approval-responded" && part.approval.approved;

/** Whether the last message asks for this change and still waits for the visitor's answer: the one answer the SDK sends. */
function waiting(messages: UIMessage[], approvalId: string): boolean {
  const last = messages[messages.length - 1];
  return last?.role === "assistant"
    && last.parts.some(part => isToolUIPart(part) && part.state === "approval-requested" && part.approval.id === approvalId);
}

async function accessToken(backend: AiVisitorSessions | undefined): Promise<string | null> {
  if (!backend) return null;
  const { data } = await backend.auth.getSession();
  return data.session?.access_token ?? null;
}

/** A signed-in visitor's request: their access token in its own header, which a live preview's door passes on as it is. */
const visitorHeaders = (token: string): Record<string, string> => ({ [aiVisitorTokenHeader]: token });

/** The page as a question carries it: the ids the route takes, then the path while there is room; nothing the route refuses. */
function pageOf(page: AiPage | undefined): AiPage {
  const entries = Object.entries(page ?? {}).filter(takes).slice(0, aiPageLimits.entries);
  const path: [string, string] = ["path", location.pathname];
  if (entries.length < aiPageLimits.entries && !entries.some(([key]) => key === "path") && takes(path)) entries.push(path);
  return Object.fromEntries(entries);
}

const takes = ([key, value]: [string, unknown]) =>
  aiPageKey.test(key) && typeof value === "string" && value.length <= aiPageLimits.valueCharacters;

/** An anonymous visitor's earlier turns as a question carries them: their words alone. */
function textTurns(messages: UIMessage[]): AiTextTurn[] {
  const turns: AiTextTurn[] = [];
  for (const { id, role, parts } of messages) {
    if (role !== "user" && role !== "assistant") continue;
    const texts = parts.filter(isTextUIPart).filter(part => part.text.trim() !== "")
      .map(part => ({ type: "text" as const, text: part.text }));
    if (texts.length) turns.push({ id, role, parts: texts });
  }
  return turns;
}

/** The last turns the route keeps, the oldest dropped until the question fits the route's size. */
function fitHistory(body: AiTurnRequest, turns: AiTextTurn[]) {
  let history = turns.slice(-aiFeatureKindLimits.assistant.historyMessages);
  while (history.length && byteLength({ ...body, history }) > aiTurnBodyBytes) history = history.slice(1);
  if (history.length) body.history = history;
}

const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

async function savedConversation(feature: string, token: string): Promise<UIMessage[]> {
  const response = await fetch(aiFeaturePath(feature), { headers: visitorHeaders(token) });
  if (!response.ok) return [];
  return messagesOf(((await response.json()) as Partial<AiConversation> | null)?.messages);
}

/** Saved messages by their shape alone: each with an id, a role and its parts. */
function messagesOf(value: unknown): UIMessage[] {
  if (!Array.isArray(value)) return [];
  return value.filter((message): message is UIMessage => typeof message === "object" && message !== null
    && typeof message.id === "string" && typeof message.role === "string" && Array.isArray(message.parts));
}

const storageKey = (feature: string) => `foundable-ai:${feature}`;

// A browser may keep nothing (a private window, or storage blocked or full): the conversation then lasts until the page closes.
function readKept(feature: string): UIMessage[] {
  try { return messagesOf(JSON.parse(localStorage.getItem(storageKey(feature)) ?? "null")); } catch { return []; }
}

function keep(feature: string, messages: UIMessage[]) {
  try {
    if (messages.length) localStorage.setItem(storageKey(feature), JSON.stringify(messages.slice(-keptMessages)));
    else localStorage.removeItem(storageKey(feature));
  } catch { /* Kept nowhere, as readKept says. */ }
}

function forget(feature: string) {
  try { localStorage.removeItem(storageKey(feature)); } catch { /* Kept nowhere, as readKept says. */ }
}
