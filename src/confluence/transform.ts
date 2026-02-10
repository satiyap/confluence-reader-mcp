import TurndownService from "turndown";
// @ts-expect-error — no type declarations available
import { gfm } from "turndown-plugin-gfm";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

turndown.use(gfm);

/**
 * Pre-process Confluence storage format HTML into standard HTML
 * that Turndown can handle. Confluence uses custom XML namespaces
 * (ac:, ri:) that DOM parsers and Turndown don't understand.
 */
function normalizeConfluenceHtml(html: string): string {
  let out = html;

  // Convert ac:layout-section / ac:layout-cell to divs
  out = out.replace(/<ac:layout-section>/gi, "<div>");
  out = out.replace(/<\/ac:layout-section>/gi, "</div>");
  out = out.replace(/<ac:layout-cell>/gi, "<div>");
  out = out.replace(/<\/ac:layout-cell>/gi, "</div>");
  out = out.replace(/<ac:layout>/gi, "<div>");
  out = out.replace(/<\/ac:layout>/gi, "</div>");

  // Convert ac:structured-macro (panels, code blocks, etc.) to divs
  // Preserve the macro name as a data attribute for potential future use
  out = out.replace(/<ac:structured-macro[^>]*ac:name="code"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi,
    (_match, inner) => {
      // Extract plain-text-body for code blocks
      const bodyMatch = inner.match(/<ac:plain-text-body>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/ac:plain-text-body>/i);
      if (bodyMatch) {
        return `<pre><code>${bodyMatch[1]}</code></pre>`;
      }
      return `<pre><code>${inner.replace(/<[^>]+>/g, "")}</code></pre>`;
    });

  // Convert info/note/warning/tip panels to blockquotes
  out = out.replace(/<ac:structured-macro[^>]*ac:name="(info|note|warning|tip|panel)"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi,
    (_match, _type, inner) => {
      const bodyMatch = inner.match(/<ac:rich-text-body>([\s\S]*?)<\/ac:rich-text-body>/i);
      return bodyMatch ? `<blockquote>${bodyMatch[1]}</blockquote>` : `<blockquote>${inner}</blockquote>`;
    });

  // Generic: any remaining ac:structured-macro — unwrap to div
  out = out.replace(/<ac:structured-macro[^>]*>/gi, "<div>");
  out = out.replace(/<\/ac:structured-macro>/gi, "</div>");

  // ac:rich-text-body → div
  out = out.replace(/<ac:rich-text-body>/gi, "<div>");
  out = out.replace(/<\/ac:rich-text-body>/gi, "</div>");

  // ac:plain-text-body with CDATA → pre
  out = out.replace(/<ac:plain-text-body>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/ac:plain-text-body>/gi,
    (_match, content) => `<pre>${content}</pre>`);
  out = out.replace(/<ac:plain-text-body>/gi, "<pre>");
  out = out.replace(/<\/ac:plain-text-body>/gi, "</pre>");

  // ac:parameter tags — remove entirely
  out = out.replace(/<ac:parameter[^>]*>[\s\S]*?<\/ac:parameter>/gi, "");

  // ac:image → img tag
  out = out.replace(/<ac:image[^>]*>([\s\S]*?)<\/ac:image>/gi, (_match, inner) => {
    const filenameMatch = inner.match(/ri:filename="([^"]+)"/i);
    const filename = filenameMatch ? filenameMatch[1] : "image";
    return `<img alt="${filename}" src="${filename}" />`;
  });

  // ac:link with ri:page → anchor
  out = out.replace(/<ac:link>([\s\S]*?)<\/ac:link>/gi, (_match, inner) => {
    const pageMatch = inner.match(/ri:content-title="([^"]+)"/i);
    const bodyMatch = inner.match(/<ac:link-body>([\s\S]*?)<\/ac:link-body>/i)
      || inner.match(/<ac:plain-text-link-body>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/ac:plain-text-link-body>/i);
    const title = pageMatch ? pageMatch[1] : "";
    const text = bodyMatch ? bodyMatch[1].replace(/<[^>]+>/g, "") : title;
    return `<a href="#">${text || title}</a>`;
  });

  // ac:emoticon → remove
  out = out.replace(/<ac:emoticon[^>]*\/>/gi, "");

  // ac:task-list / ac:task / ac:task-body → ul/li
  out = out.replace(/<ac:task-list>/gi, "<ul>");
  out = out.replace(/<\/ac:task-list>/gi, "</ul>");
  out = out.replace(/<ac:task>([\s\S]*?)<\/ac:task>/gi, (_match, inner) => {
    const statusMatch = inner.match(/<ac:task-status>([\s\S]*?)<\/ac:task-status>/i);
    const bodyMatch = inner.match(/<ac:task-body>([\s\S]*?)<\/ac:task-body>/i);
    const checked = statusMatch && statusMatch[1].trim() === "complete";
    const body = bodyMatch ? bodyMatch[1] : inner;
    return `<li>${checked ? "[x] " : "[ ] "}${body}</li>`;
  });

  // Remove any remaining ac:* or ri:* tags but keep their text content
  out = out.replace(/<\/?(?:ac|ri):[^>]*>/gi, "");

  // Clean up CDATA remnants
  out = out.replace(/<!\[CDATA\[/g, "");
  out = out.replace(/\]\]>/g, "");

  return out;
}

/**
 * Convert Confluence storage format HTML to GitHub-flavored markdown.
 *
 * @param storageHtml - Confluence storage format HTML
 * @returns Markdown with headings, tables, lists, code blocks, etc.
 */
export function storageToMarkdown(storageHtml: string): string {
  const normalized = normalizeConfluenceHtml(storageHtml);
  return turndown.turndown(normalized);
}
