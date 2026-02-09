import { ConfluencePageResponse, ConfluenceChildrenResponse } from "./types.js";

export type ConfluenceClientConfig = {
  token: string;        // Scoped API token
  email?: string;       // User email (required for scoped tokens)
  cloudId?: string;     // Atlassian Cloud ID
  baseUrl?: string;     // Direct tenant URL (e.g., https://yourtenant.atlassian.net)
};

/**
 * Build authorization headers for Confluence API requests
 * Scoped API tokens use Basic Auth with email:token
 * 
 * @see https://support.atlassian.com/confluence/kb/scoped-api-tokens-in-confluence-cloud/
 */
export function buildAuthHeaders(cfg: ConfluenceClientConfig): HeadersInit {
  if (cfg.email) {
    // Scoped tokens use Basic Auth with email:token
    const credentials = Buffer.from(`${cfg.email}:${cfg.token}`).toString('base64');
    return { Authorization: `Basic ${credentials}` };
  }
  // Fallback to Bearer for other token types
  return { Authorization: `Bearer ${cfg.token}` };
}

/**
 * Build base URL for Confluence API requests
 * Prefers cloudId routing over direct baseUrl
 */
export function buildBase(cfg: ConfluenceClientConfig): string {
  // Prefer cloudId routing (works well with scoped token access patterns)
  if (cfg.cloudId) return `https://api.atlassian.com/ex/confluence/${cfg.cloudId}`;
  if (cfg.baseUrl) return cfg.baseUrl;
  throw new Error("Set CONFLUENCE_CLOUD_ID or CONFLUENCE_BASE_URL.");
}

/**
 * Fetch a Confluence page by ID using the v2 REST API
 * 
 * @param cfg - Client configuration with token and routing info
 * @param pageId - Numeric page ID
 * @returns Page data including title, content, and metadata
 * @throws Error if API request fails
 */
export async function fetchPageById(cfg: ConfluenceClientConfig, pageId: string): Promise<ConfluencePageResponse> {
  const base = buildBase(cfg);
  
  // v2 endpoint with body-format=storage to get HTML content
  const url = new URL(`${base}/wiki/api/v2/pages/${pageId}`);
  url.searchParams.set("body-format", "storage");
  
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      ...buildAuthHeaders(cfg),
      Accept: "application/json"
    }
  });
  
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Confluence API error ${res.status}: ${text.slice(0, 500)}`);
  }
  
  return (await res.json()) as ConfluencePageResponse;
}

/**
 * Fetch direct child pages of a Confluence page using the v2 REST API.
 * Returns all children (paginates automatically).
 */
export async function fetchChildPages(cfg: ConfluenceClientConfig, pageId: string): Promise<ConfluencePageResponse[]> {
  const base = buildBase(cfg);
  const all: ConfluencePageResponse[] = [];
  let cursor: string | undefined;

  while (true) {
    const url = new URL(`${base}/wiki/api/v2/pages/${pageId}/children`);
    url.searchParams.set("limit", "50");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        ...buildAuthHeaders(cfg),
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Confluence API error ${res.status}: ${text.slice(0, 500)}`);
    }

    const data = (await res.json()) as ConfluenceChildrenResponse;
    all.push(...data.results);

    if (!data._links?.next) break;

    // The next link contains the cursor parameter
    const nextUrl = new URL(data._links.next, base);
    cursor = nextUrl.searchParams.get("cursor") ?? undefined;
    if (!cursor) break;
  }

  return all;
}

/**
 * Represents a page node in a recursive page tree.
 */
export type PageNode = {
  id: string;
  title: string;
  content: string;
  children: PageNode[];
};

/**
 * Recursively fetch a page and its descendants up to the given depth.
 *
 * For each page it:
 *  1. Fetches the full page content via fetchPageById
 *  2. Discovers child page IDs via fetchChildPages
 *  3. Recurses into each child (in parallel) until depth is exhausted
 *
 * Children at each level are fetched concurrently with a concurrency
 * limit to avoid hammering the API. Pages that fail to load are
 * included as stubs with an error message instead of aborting the
 * entire tree.
 *
 * @param cfg - Client configuration
 * @param pageId - Root page ID to start from
 * @param depth - How many levels of children to fetch (0 = root only)
 * @param concurrency - Max parallel requests per level (default 5)
 * @returns A tree of PageNode objects
 */
export async function fetchPageTree(
  cfg: ConfluenceClientConfig,
  pageId: string,
  depth: number,
  concurrency: number = 5
): Promise<PageNode> {
  const { storageToText } = await import("./transform.js");

  const page = await fetchPageById(cfg, pageId);
  const storage = page.body?.storage?.value ?? "";
  const content = storage ? storageToText(storage) : "";

  const children: PageNode[] = [];
  if (depth > 0) {
    const childPages = await fetchChildPages(cfg, pageId);

    // Fetch children in parallel, bounded by concurrency limit
    const results = await parallelMap(
      childPages,
      (child) => fetchPageTree(cfg, child.id, depth - 1, concurrency).catch((err): PageNode => ({
        id: child.id,
        title: child.title ?? `Page ${child.id}`,
        content: `[Error fetching page: ${(err as Error).message}]`,
        children: [],
      })),
      concurrency
    );
    children.push(...results);
  }

  return { id: page.id, title: page.title, content, children };
}

/**
 * Run an async mapper over items with a concurrency limit.
 */
async function parallelMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit: number
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

