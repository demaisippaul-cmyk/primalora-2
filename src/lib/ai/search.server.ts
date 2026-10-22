// Foundable AI kit: search over the website's own tables, by words and by meaning in one ranked list, as the visitor.
// Foundable keeps this file and replaces it whole when the kit changes, so never edit it. search-setup.sql, applied once per
// website, gives the database private.make_searchable(table, columns, language); one call per table makes that table's
// search functions, which run under its own row level security, so a search returns only the rows its visitor may see. The
// question's embedding runs on Foundable AI's embedding model through the helper (embedding()), never on the website's
// model, whose "default" the door takes on its chat endpoints alone: stored vectors match only the model that made them.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { embed, embedMany } from "ai";
import { embedding } from "../ai.server";
import { isServerKey, type Visitor } from "./visitor.server";

/** The setup's vector size: Foundable AI's embedding model shortened by OpenAI, which keeps its vectors normalized. */
const dimensions = 512;
const openai = { dimensions };
/** Rows one refresh embeds: each search's refresh stays a moment, and one call never embeds more than the embeddings call takes. */
const refreshBatch = 20;
/**
 * The most bytes of one row's text an embeddings call is sent: OpenAI takes at most 8,192 tokens an input, and a token is at
 * least one byte, so a text cut here always fits, where the setup's cut at 6,000 characters can run to four times as many
 * bytes; a refused row would otherwise fail every batch holding it, on every search.
 */
const embedBytes = 8_000;

/** `text` within `embedBytes`, cut at a character's edge. */
function cutToBytes(text: string): string {
  const encoded = new TextEncoder().encode(text);
  if (encoded.byteLength <= embedBytes) return text;
  return new TextDecoder("utf-8").decode(encoded.subarray(0, embedBytes)).replace(/�+$/u, "");
}
/** How many rows a read asks for: the number asked, or none, so the setup's own default (10 for a search, 6 for similar) decides. */
const asked = (count: number | undefined): { match_count?: number } => count === undefined ? {} : { match_count: count };
/**
 * A table's name as the setup takes one, lower-case letters, digits and underscores: the Data API's client builds `/rpc/<name>`
 * from it, so any other name (one with a slash) would leave that path, with the server key in a refresh.
 */
const identifier = /^[a-z_][a-z0-9_]*$/u;
function tableName(table: string): string {
  if (!identifier.test(table)) throw new Error(`Foundable AI: ${JSON.stringify(table)} is not a table the kit searches: a name is lower-case letters, digits and underscores.`);
  return table;
}
/** A client that keeps no session of its own. */
const sessionless = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } as const;

/** What a search or a refresh is made for: the feature's id, which labels its embedding calls in the website's AI calls. */
export interface SearchCall {
  feature?: string;
}

/** The headers a feature's embedding calls carry, so the website's owner sees them under the feature. */
const callHeaders = (call: SearchCall): { headers?: Record<string, string> } =>
  call.feature ? { headers: { ["x-app-ai-feature"]: call.feature } } : {};

/**
 * The website's database as the visitor (`Visitor.db`): a search takes the visitor, never a client, and refuses a client
 * holding the server key, which skips every row policy, so a visitor built by hand around it fails before any read.
 */
function database(visitor: Visitor): SupabaseClient {
  if (!visitor.db) throw new Error("Foundable AI: this website has no database, so there is nothing to search.");
  const key = (visitor.db as unknown as { supabaseKey?: unknown }).supabaseKey;
  if (typeof key === "string" && isServerKey(key))
    throw new Error("Foundable AI: a search runs as the visitor, never with the website's server key, which this client holds.");
  return visitor.db;
}

/**
 * The question's embedding, or null where it could not be made (AI paused or busy, the preview without Foundable AI's names),
 * when the search goes by words alone.
 */
export async function queryEmbedding(query: string, call: SearchCall = {}): Promise<number[] | null> {
  try {
    return (await embed({ model: embedding(), value: query, providerOptions: { openai }, ...callHeaders(call) })).embedding;
  } catch (error) {
    console.error("Foundable AI: the question's embedding failed, so this search goes by words alone.", error);
    return null;
  }
}

/**
 * The rows of `table` matching `query` by words or by meaning, best first (`search_<table>`), as the visitor may read them,
 * with `columns` of each ("id, name, price"; never the embedding): at most `count` rows, the setup's default unless asked.
 * First the rows whose text changed since their embedding are embedded again (`refreshEmbeddings`), so a new or edited row
 * is found by meaning too: the search waits for that refresh and for the question's embedding, and a refresh that fails
 * never stops it. `feature` labels the embedding calls.
 */
export async function search<Row = Record<string, unknown>>(visitor: Visitor, table: string, query: string, columns: string,
  options: SearchCall & { count?: number; refresh?: boolean } = {}): Promise<Row[]> {
  const db = database(visitor), name = tableName(table);
  if (options.refresh !== false) {
    try { await refreshEmbeddings(name, options); }
    catch (error) { console.error(`Foundable AI: ${name}'s embeddings could not be refreshed before this search.`, error); }
  }
  const { data, error } = await db.rpc(`search_${name}`, { query, query_embedding: await queryEmbedding(query, options), ...asked(options.count) })
    .select(columns);
  if (error) throw new Error(`Foundable AI could not search ${table} (${error.code}).`, { cause: error });
  return (data ?? []) as Row[];
}

/**
 * The rows of `table` nearest in meaning to its row `rowId` (`similar_<table>`), as the visitor may read them, with `columns`
 * of each: at most `count` rows, the setup's default unless asked. Nothing is embedded: both sides are stored vectors.
 */
export async function similar<Row = Record<string, unknown>>(visitor: Visitor, table: string, rowId: string | number, columns: string,
  options: { count?: number } = {}): Promise<Row[]> {
  const { data, error } = await database(visitor).rpc(`similar_${tableName(table)}`, { row_id: rowId, ...asked(options.count) }).select(columns);
  if (error) throw new Error(`Foundable AI could not read what is similar in ${table} (${error.code}).`, { cause: error });
  return (data ?? []) as Row[];
}

/**
 * The website's database with its server key, for the refresh alone, or null where this process holds no server key (a
 * live preview, until the website is published): the names Foundable sets for the published website.
 */
function serverDatabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: sessionless }) : null;
}

/**
 * Embeds up to `batch` rows of `table` whose searchable text changed since their embedding, rows with none included
 * (`<table>_to_embed`, `save_<table>_embeddings`, which the setup grants to the server key alone, so no visitor plants an
 * embedding that ranks their row first), and answers how many it embedded: 0 once every row is current, and 0 where this
 * process holds no server key, where search goes by words until the published website refreshes. Call it after the website's
 * server code writes searchable rows, and from the owner's Update search action until it answers 0; every search calls it too.
 */
export async function refreshEmbeddings(table: string, options: SearchCall & { batch?: number } = {}): Promise<number> {
  const name = tableName(table), admin = serverDatabase();
  if (!admin) return 0;
  const { data, error } = await admin.rpc(`${name}_to_embed`, { batch: options.batch ?? refreshBatch });
  if (error) throw new Error(`Foundable AI could not list the rows of ${name} to embed (${error.code}).`, { cause: error });
  const rows = (data ?? []) as { id: string; text: string; hash: string }[];
  if (!rows.length) return 0;
  const { embeddings } = await embedMany({ model: embedding(), values: rows.map(row => cutToBytes(row.text)), providerOptions: { openai }, ...callHeaders(options) });
  const items = rows.map((row, at) => ({ id: row.id, hash: row.hash, embedding: embeddings[at] }));
  const { error: saveError } = await admin.rpc(`save_${name}_embeddings`, { items });
  if (saveError) throw new Error(`Foundable AI could not save the embeddings of ${name} (${saveError.code}).`, { cause: saveError });
  return rows.length;
}
