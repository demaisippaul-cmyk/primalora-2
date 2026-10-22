// Foundable AI kit: web search for an AI feature whose file knows the web (`"knows"` holding "web"), which the feature's route
// (feature.server.ts) gives its model as the "web_search" tool. Foundable keeps this file and replaces it whole when the
// kit changes, so never edit it. Foundable sets PERPLEXITY_BASE_URL and PERPLEXITY_API_KEY for the published site and its live
// preview, so a search needs no key and the owner's credits pay for each one; a key of the owner's own reaches Perplexity directly.
import { jsonSchema, tool, type Tool } from "ai";

/** What the model reads where no search came back, so the visitor's answer goes on without it. */
const unavailable = "Web search is unavailable right now, so answer without it and say you could not look it up.";
/** The kit's search budget: queries in one search, results, their text in tokens all told and a page's, a snippet's characters, the wait. */
const limits = {"queries":3,"results":5,"tokens":4000,"tokensPerPage":1024,"snippetCharacters":2000,"waitMs":30000};

/** How a feature narrows its searches, from its job: only some sites, only recent pages, one country's first. */
export interface WebSearchOptions {
  /** Only these sites (`example.com`), or every site but one where its name starts with "-": at most 20. */
  domains?: string[];
  /** Only pages from the last hour, day, week, month or year. */
  recency?: "hour" | "day" | "week" | "month" | "year";
  /** A country's results first, by its two-letter code (ISO 3166-1, `US`). */
  country?: string;
}

/** One source the model reads: its page's title, address, date where it has one, and what the page says on the question. */
interface Source {
  title: string;
  url: string;
  date: string | null;
  snippet: string;
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** What the model asks the search for: short queries, each a string. */
const queriesInput = jsonSchema<{ queries: string[] }>({ type: "object", additionalProperties: false, required: ["queries"],
  properties: { queries: { type: "array", items: { type: "string" }, description: "One to three short keyword queries, each about one thing" } } }, {
  validate: value => record(value) && Array.isArray(value.queries) && value.queries.every(query => typeof query === "string")
    ? { success: true, value: { queries: value.queries as string[] } }
    : { success: false, error: new Error("queries must be a list of words to search for") } });

/** A result as Perplexity answers one, a page with its title, address and snippet; anything else reads as none. */
function sourceOf(result: unknown): Source | null {
  if (!record(result) || typeof result.title !== "string" || typeof result.url !== "string" || typeof result.snippet !== "string") return null;
  if (!/^https?:\/\//iu.test(result.url)) return null;
  const date = typeof result.date === "string" && result.date ? result.date : typeof result.last_updated === "string" && result.last_updated ? result.last_updated : null;
  return { title: result.title.slice(0, 300), url: result.url, date, snippet: result.snippet.slice(0, limits.snippetCharacters) };
}

/**
 * The feature's web search, made for one visitor's turn: one search of up to `limits.queries` short queries, its results' titles,
 * links, dates and snippets back to the model, which answers from them and links the pages it used. Each search carries the
 * feature and the turn, as its model calls do, so the owner sees it under the feature. A search that failed or found nothing
 * tells the model so, and a failure logs the kit's line with the door's status, by which Build's check tells Foundable AI's
 * own refusal (the website's limit, the owner's credits) from the feature's failure.
 */
export function webSearch(feature: string, turn: string, options: WebSearchOptions = {}): Tool {
  return tool({
    description: "Search the web for current or outside information: news, prices, opening times, events, reviews, availability, "
      + "another site's facts. Give one to three short keyword queries, each about one thing, and answer from the sources it returns.",
    inputSchema: queriesInput,
    execute: async ({ queries }, { abortSignal }) => {
      const asked = queries.map(query => query.trim()).filter(Boolean).slice(0, limits.queries);
      const key = process.env.PERPLEXITY_API_KEY;
      if (!asked.length || !key) return unavailable;
      const base = (process.env.PERPLEXITY_BASE_URL || "https://api.perplexity.ai").replace(/\/+$/u, "");
      const signal = abortSignal ? AbortSignal.any([abortSignal, AbortSignal.timeout(limits.waitMs)]) : AbortSignal.timeout(limits.waitMs);
      let answer: Response;
      try {
        answer = await fetch(`${base}/search`, { method: "POST", signal, headers: { authorization: `Bearer ${key}`, "content-type": "application/json",
          ["x-app-ai-feature"]: feature, ["x-app-ai-turn"]: turn }, body: JSON.stringify({ query: asked.length === 1 ? asked[0] : asked,
          search_type: "fast", max_results: limits.results, max_tokens: limits.tokens, max_tokens_per_page: limits.tokensPerPage,
          ...(options.domains?.length ? { search_domain_filter: options.domains.slice(0, 20) } : {}),
          ...(options.recency ? { search_recency_filter: options.recency } : {}), ...(options.country ? { country: options.country } : {}) }) });
      } catch (error) {
        if (abortSignal?.aborted) throw error;
        console.error("Foundable AI: the call failed " + JSON.stringify({ status: null, code: null }));
        return unavailable;
      }
      if (!answer.ok) {
        const code = await answer.json().then((body: unknown) => record(body) && record(body.error) && typeof body.error.code === "string" ? body.error.code : null,
          () => null);
        console.error("Foundable AI: the call failed " + JSON.stringify({ status: answer.status, code }));
        return unavailable;
      }
      const body: unknown = await answer.json().catch(() => null);
      // A search of several queries may answer each one's results in a list of its own.
      const results = record(body) && Array.isArray(body.results) ? (body.results as unknown[]).flatMap(item => Array.isArray(item) ? item : [item]) : [];
      const seen = new Set<string>(), sources: Source[] = [];
      for (const source of results.map(sourceOf)) if (source && !seen.has(source.url) && sources.length < limits.results) {
        seen.add(source.url);
        sources.push(source);
      }
      return sources.length ? { sources } : "The web search found nothing on that. Answer without it, or search again with other words.";
    },
  });
}
