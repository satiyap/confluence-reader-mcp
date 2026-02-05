import { ConfluencePageResponse } from "./types.js";

type ConfluenceClientConfig = {
  token: string;        // Scoped API token
  cloudId?: string;     // Atlassian Cloud ID
  baseUrl?: string;     // Direct tenant URL (e.g., https://yourtenant.atlassian.net)
};

/**
 * Build authorization headers for Confluence API requests
 * Only supports scoped API tokens with Bearer authentication
 * 
 * @see https://support.atlassian.com/confluence/kb/scoped-api-tokens-in-confluence-cloud/
 */
function buildAuthHeaders(cfg: ConfluenceClientConfig): HeadersInit {
  return { Authorization: `Bearer ${cfg.token}` };
}

/**
 * Build base URL for Confluence API requests
 * Prefers cloudId routing over direct baseUrl
 */
function buildBase(cfg: ConfluenceClientConfig): string {
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
