// Foundable AI kit: who is asking an AI feature, and the website's database as them. Foundable keeps this file and replaces
// it whole when the kit changes, so never edit it.
import { createClient, isAuthRetryableFetchError, type SupabaseClient } from "@supabase/supabase-js";
import { aiVisitorTokenHeader } from "./turn";

/** The person asking an AI feature, as its tools see them. */
export interface Visitor {
  /** The signed-in visitor's id, as the website's backend verified their sign-in; null for anyone not signed in. */
  userId: string | null;
  /**
   * The website's database as this visitor, under its row level security: their own rows when signed in, and what anyone may
   * see or add when not; null where the website has no backend. Never the website's server key, so nothing a visitor or a
   * page's text says to the model reaches another person's rows.
   */
  db: SupabaseClient | null;
}

/** A client that keeps no session of its own: each request names its visitor. */
const sessionless = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } as const;

/** A database's server key, which skips every row policy: Supabase's secret key, or a legacy key whose role is one of these. */
const serverKey = { prefix: "sb_secret_", roles: ["service_role","supabase_admin"] as readonly string[] };

/** Whether a key is the backend's server key, never handed to tools however the website's code names it; search.server.ts refuses a client holding one. */
export function isServerKey(key: string): boolean {
  if (key.startsWith(serverKey.prefix)) return true;
  const parts = key.split("."), claims = parts[1];
  if (parts.length !== 3 || !claims) return false;
  try {
    const role = (JSON.parse(atob(claims.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(claims.length / 4) * 4, "="))) as { role?: unknown } | null)?.role;
    return typeof role === "string" && serverKey.roles.includes(role);
  } catch { return false; }
}

/**
 * The website's backend, its address and publishable key: as Foundable sets them for the published website and a live
 * preview in the website's own sandbox, else as src/lib/backend.ts, the client the builder writes from the same two values,
 * holds them, which is all a live preview has today. A server key found there instead stops the feature, never reaching a tool.
 */
function backend(): { url: string; key: string } | null {
  const found = fromEnvironment() ?? fromBackendFile();
  if (found && isServerKey(found.key))
    throw new Error("Foundable AI: the website's backend key the kit found is its server key, which skips every row policy, so this feature will not run with it.");
  return found;
}

function fromEnvironment(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}

function fromBackendFile(): { url: string; key: string } | null {
  // Vite resolves this at build time; it is empty where src/lib/backend.ts does not exist.
  const modules: Record<string, unknown> = import.meta.env ? import.meta.glob("../backend.ts", { eager: true }) : {};
  for (const module of Object.values(modules))
    for (const value of Object.values(module as Record<string, unknown>)) {
      const client = value as { supabaseUrl?: unknown; supabaseKey?: unknown } | null;
      if (client && typeof client.supabaseUrl === "string" && typeof client.supabaseKey === "string") return { url: client.supabaseUrl, key: client.supabaseKey };
    }
  return null;
}

let verifier: { address: string; client: SupabaseClient } | undefined;

/**
 * Who sent a request: a signed-in visitor by the access token their page sends (`aiVisitorTokenHeader`), verified by the
 * website's backend; anyone without one as not signed in; and null for a token the backend does not accept, so a lapsed
 * sign-in is never quietly taken for none. A backend whose sign-in service cannot be reached throws, a failure to retry.
 */
export async function visitorOf(request: Request): Promise<Visitor | null> {
  const address = backend(), token = request.headers.get(aiVisitorTokenHeader);
  if (token === null) return { userId: null, db: address && createClient(address.url, address.key, { auth: sessionless }) };
  if (!token || !address) return null;
  if (verifier?.address !== `${address.url} ${address.key}`)
    verifier = { address: `${address.url} ${address.key}`, client: createClient(address.url, address.key, { auth: sessionless }) };
  const { data, error } = await verifier.client.auth.getClaims(token);
  if (isAuthRetryableFetchError(error))
    throw new Error("Foundable AI could not reach the website's sign-in service to check this visitor.", { cause: error });
  const userId = data?.claims.sub;
  if (typeof userId !== "string" || !userId || data?.claims.role !== "authenticated") return null;
  return { userId, db: createClient(address.url, address.key, { auth: sessionless, global: { headers: { Authorization: `Bearer ${token}` } } }) };
}
