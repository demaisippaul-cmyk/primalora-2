// Foundable AI kit: a conversation with an AI feature, and what a turn does to it. A signed-in visitor's is kept in the
// website's database as their own row (ai_conversations, conversations.sql); an anonymous visitor's stays in their browser.
// Foundable keeps this file and replaces it whole when the kit changes, so never edit it.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UIMessage } from "ai";
import { aiChangeWords, type AiPress, type AiQuestion, type AiTextTurn } from "./turn";

const table = "ai_conversations";
type Part = UIMessage["parts"][number];
type ToolPart = Part & { type: `tool-${string}`; toolCallId: string; state: string; approval?: { id: string; approved?: boolean; reason?: string } };

/**
 * The visitor's saved conversation with a feature, its messages [] when there is none, and when it was last kept (null with
 * no row): their own row alone, under row level security.
 */
export async function loadConversation(db: SupabaseClient, feature: string): Promise<{ messages: unknown[]; updatedAt: string | null }> {
  const { data, error } = await db.from(table).select("messages, updated_at").eq("feature", feature).maybeSingle();
  if (error) throw new Error(`Foundable AI could not read this visitor's conversation (${error.code}).`, { cause: error });
  const row = data as { messages?: unknown; updated_at?: unknown } | null;
  return { messages: Array.isArray(row?.messages) ? row.messages : [], updatedAt: typeof row?.updated_at === "string" ? row.updated_at : null };
}

/** Keeps the visitor's conversation with a feature as their own row, written as them. */
export async function saveConversation(db: SupabaseClient, feature: string, messages: UIMessage[]): Promise<void> {
  const { error } = await db.from(table).upsert({ feature, messages, updated_at: new Date().toISOString() }, { onConflict: "user_id,feature" });
  if (error) throw new Error(`Foundable AI could not keep this visitor's conversation (${error.code}).`, { cause: error });
}

/**
 * Keeps the visitor's conversation with a feature only over the row they read, kept at `updatedAt`, and says whether it did:
 * of two presses of one Confirm that both read the change waiting, only the first to keep its decision runs the change.
 */
export async function saveConversationIfUnchanged(db: SupabaseClient, feature: string, messages: UIMessage[], updatedAt: string): Promise<boolean> {
  // Later than the row's own stamp even where this server's clock is behind the one that wrote it, so this save never
  // leaves the row looking unchanged to a press that read it before.
  const stamp = new Date(Math.max(Date.now(), (Date.parse(updatedAt) || 0) + 1)).toISOString();
  const { data, error } = await db.from(table).update({ messages, updated_at: stamp }).eq("feature", feature).eq("updated_at", updatedAt)
    .select("feature");
  if (error) throw new Error(`Foundable AI could not keep this visitor's conversation (${error.code}).`, { cause: error });
  return data.length > 0;
}

/** Clears the visitor's conversation with a feature. */
export async function clearConversation(db: SupabaseClient, feature: string): Promise<void> {
  const { error } = await db.from(table).delete().eq("feature", feature);
  if (error) throw new Error(`Foundable AI could not clear this visitor's conversation (${error.code}).`, { cause: error });
}

const isTool = (part: Part): part is ToolPart => part.type.startsWith("tool-");

/**
 * A conversation's earlier answers as the next turn reads them: a confirmation nobody answered is a change not made, and
 * a confirmed change whose answer was lost before its result was kept is one whose result is unknown, never run again.
 */
function settled(messages: UIMessage[]): UIMessage[] {
  return messages.map(message => message.role !== "assistant" ? message : { ...message, parts: message.parts.map(part => {
    if (!isTool(part) || !part.approval) return part;
    if (part.state === "approval-requested") return { ...part, state: "output-denied", approval: { ...part.approval, approved: false, reason: aiChangeWords.notConfirmed } } as Part;
    if (part.state !== "approval-responded") return part;
    return (part.approval.approved ? { ...part, state: "output-error", errorText: aiChangeWords.unknownResult } : { ...part, state: "output-denied" }) as Part;
  }) });
}

/** The visitor's new message as the conversation keeps it. */
export function questionMessage(question: AiQuestion): UIMessage {
  return { id: question.id, role: "user", parts: [{ type: "text", text: question.text }] };
}

/** An anonymous visitor's earlier messages, their words alone. */
export function textMessages(history: AiTextTurn[]): UIMessage[] {
  return history.map(turn => ({ id: turn.id, role: turn.role, parts: turn.parts.map(part => ({ type: "text" as const, text: part.text })) }));
}

/**
 * A signed-in visitor's saved conversation with their new message, or null where another page already moved it on. The same
 * message sent again (a retry, by its id) is asked again in its place, dropping what was kept after it.
 */
export function withQuestion(saved: UIMessage[], question: AiQuestion): UIMessage[] | null {
  const at = saved.findIndex(message => message.id === question.id);
  if (at < 0) return [...settled(saved), questionMessage(question)];
  if (saved[at]!.role !== "user" || saved.slice(at + 1).some(message => message.role === "user")) return null;
  return [...settled(saved.slice(0, at)), questionMessage(question)];
}

/**
 * A signed-in visitor's saved conversation with their Confirm or Cancel applied, or null where it answers no confirmation
 * the conversation holds: only the decisions are taken, each for a confirmation the kit kept waiting in the last answer,
 * every one of them answered, and the change each confirms is the one kept, never the one the press names.
 */
export function withDecisions(saved: UIMessage[], press: AiPress): UIMessage[] | null {
  const last = saved.at(-1);
  if (!last || last.role !== "assistant" || last.id !== press.messageId) return null;
  const decisions = new Map(press.parts.flatMap(part => part.type === "confirmation" ? [[part.approvalId, part] as const] : []));
  const waiting = last.parts.filter((part): part is ToolPart => isTool(part) && part.state === "approval-requested" && !!part.approval);
  if (!waiting.length || waiting.length !== decisions.size || waiting.some(part => !decisions.has(part.approval!.id))) return null;
  const answered = last.parts.map(part => {
    const decision = isTool(part) && part.state === "approval-requested" && part.approval ? decisions.get(part.approval.id) : undefined;
    if (!decision || !isTool(part)) return part;
    return { ...part, state: "approval-responded",
      approval: { ...part.approval, approved: decision.approved, ...(decision.reason === undefined ? {} : { reason: decision.reason }) } } as Part;
  });
  return [...settled(saved.slice(0, -1)), { ...last, parts: answered }];
}

/** An anonymous visitor's press as the answer it confirms, since nothing is kept for them: its words and its confirmed changes. */
export function pressedMessage(press: AiPress): UIMessage {
  return { id: press.messageId, role: "assistant", parts: press.parts.map(part => part.type === "text" ? part
    : { type: `tool-${part.toolName}`, toolCallId: part.toolCallId, state: "approval-responded", input: part.input,
      approval: { id: part.approvalId, approved: part.approved, ...(part.reason === undefined ? {} : { reason: part.reason }) } } as Part) };
}

/** A conversation's newest messages: the last and at most `earlier` before it, within `bytes` of JSON, the oldest left out first. */
export function newest(messages: UIMessage[], earlier: number, bytes: number): UIMessage[] {
  let kept = messages.slice(-(Math.max(0, earlier) + 1));
  while (kept.length > 1 && new TextEncoder().encode(JSON.stringify(kept)).length > bytes) kept = kept.slice(1);
  return kept;
}
