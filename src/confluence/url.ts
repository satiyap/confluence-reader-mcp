/**
 * Extract Confluence page ID from various URL formats
 * 
 * Supported formats:
 * - /wiki/spaces/KEY/pages/123456789/Title
 * - /wiki/pages/viewpage.action?pageId=123456789
 * 
 * @param url - Full Confluence page URL
 * @returns Page ID as string
 * @throws Error if URL format is not recognized
 */
export function extractConfluencePageId(url: string): string {
  // Common Confluence Cloud patterns:
  // 1) /wiki/spaces/KEY/pages/123456789/Title
  // 2) /wiki/pages/viewpage.action?pageId=123456789
  // 3) Some short links redirect, but the final URL usually matches one of the above.
  
  try {
    const u = new URL(url);
    
    // Pattern 2: viewpage.action?pageId=...
    const pageId = u.searchParams.get("pageId");
    if (pageId && /^\d+$/.test(pageId)) return pageId;
    
    // Pattern 1: .../pages/<id>/...
    const m = u.pathname.match(/\/pages\/(\d+)(\/|$)/);
    if (m?.[1]) return m[1];
    
    throw new Error("Unsupported Confluence URL format (no pageId found).");
  } catch (e) {
    throw new Error(`Invalid URL: ${(e as Error).message}`);
  }
}
