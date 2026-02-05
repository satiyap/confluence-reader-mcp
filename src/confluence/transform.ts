/**
 * Convert Confluence storage HTML to plain text
 * 
 * This is a lightweight HTML-to-text converter that:
 * - Strips HTML tags
 * - Preserves paragraph and heading breaks
 * - Decodes common HTML entities
 * 
 * Note: Not a perfect HTML→Markdown converter; intentionally simple for MCP use.
 * 
 * @param storageHtml - Confluence storage format HTML
 * @returns Plain text representation
 */
export function storageToText(storageHtml: string): string {
  // Minimal, safe-ish conversion:
  // - strip tags
  // - preserve headings/paragraph-ish breaks
  // Not a perfect HTML->MD converter; intentionally lightweight for an MCP tool.
  
  const withBreaks = storageHtml
    .replace(/<\/(p|h1|h2|h3|h4|li|tr|div)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  
  const stripped = withBreaks.replace(/<[^>]+>/g, "");
  const decoded = stripped
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
  
  return decoded
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}
