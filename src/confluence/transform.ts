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

  // --- Confluence layout tags → divs ---
  out = out.replace(/<ac:layout-section[^>]*>/gi, "<div>");
  out = out.replace(/<\/ac:layout-section>/gi, "</div>");
  out = out.replace(/<ac:layout-cell>/gi, "<div>");
  out = out.replace(/<\/ac:layout-cell>/gi, "</div>");
  out = out.replace(/<ac:layout>/gi, "<div>");
  out = out.replace(/<\/ac:layout>/gi, "</div>");

  // --- Table cleanup: strip attributes and colgroup so Turndown can parse ---
  out = out.replace(/<table[^>]*>/gi, "<table>");
  out = out.replace(/<colgroup>[\s\S]*?<\/colgroup>/gi, "");
  out = out.replace(/<col[^>]*\/?>/gi, "");
  out = out.replace(/<div class="content-wrapper">/gi, "");
  // (closing </div> for content-wrapper will be handled by generic div cleanup later)

  // --- Jira macro → text reference (extract key) ---
  out = out.replace(/<ac:structured-macro[^>]*ac:name="jira"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi,
    (_match, inner) => {
      const keyMatch = inner.match(/<ac:parameter[^>]*ac:name="key"[^>]*>([\s\S]*?)<\/ac:parameter>/i);
      return keyMatch ? `<code>${keyMatch[1].trim()}</code>` : "";
    });

  // --- TOC and other self-closing macros → remove ---
  out = out.replace(/<ac:structured-macro[^>]*\/>/gi, "");

  // --- Code blocks ---
  out = out.replace(/<ac:structured-macro[^>]*ac:name="code"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi,
    (_match, inner) => {
      const bodyMatch = inner.match(/<ac:plain-text-body>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/ac:plain-text-body>/i);
      if (bodyMatch) {
        return `<pre><code>${bodyMatch[1]}</code></pre>`;
      }
      return `<pre><code>${inner.replace(/<[^>]+>/g, "")}</code></pre>`;
    });

  // --- Info/note/warning/tip panels → blockquotes ---
  out = out.replace(/<ac:structured-macro[^>]*ac:name="(info|note|warning|tip|panel)"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi,
    (_match, _type, inner) => {
      const bodyMatch = inner.match(/<ac:rich-text-body>([\s\S]*?)<\/ac:rich-text-body>/i);
      return bodyMatch ? `<blockquote>${bodyMatch[1]}</blockquote>` : `<blockquote>${inner}</blockquote>`;
    });

  // --- Generic remaining ac:structured-macro → unwrap to div ---
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

  // --- ac:image → img tag ---
  out = out.replace(/<ac:image[^>]*>([\s\S]*?)<\/ac:image>/gi, (_match, inner) => {
    const filenameMatch = inner.match(/ri:filename="([^"]+)"/i);
    const filename = filenameMatch ? filenameMatch[1] : "image";
    return `<img alt="${filename}" src="${filename}" />`;
  });

  // --- ac:link: handle attachment links, user mentions, and page links ---
  out = out.replace(/<ac:link>([\s\S]*?)<\/ac:link>/gi, (_match, inner) => {
    // Attachment link
    const attachMatch = inner.match(/ri:filename="([^"]+)"/i);
    if (attachMatch) {
      return `<a href="#">📎 ${attachMatch[1]}</a>`;
    }
    // User mention
    if (/<ri:user/i.test(inner)) {
      return `<code>@user</code>`;
    }
    // Page link
    const pageMatch = inner.match(/ri:content-title="([^"]+)"/i);
    const bodyMatch = inner.match(/<ac:link-body>([\s\S]*?)<\/ac:link-body>/i)
      || inner.match(/<ac:plain-text-link-body>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/ac:plain-text-link-body>/i);
    const title = pageMatch ? pageMatch[1] : "";
    const text = bodyMatch ? bodyMatch[1].replace(/<[^>]+>/g, "") : title;
    return `<a href="#">${text || title}</a>`;
  });

  // ac:emoticon → remove
  out = out.replace(/<ac:emoticon[^>]*\/>/gi, "");

  // --- ac:task-list / ac:task → ul/li ---
  out = out.replace(/<ac:task-list>/gi, "<ul>");
  out = out.replace(/<\/ac:task-list>/gi, "</ul>");
  out = out.replace(/<ac:task>([\s\S]*?)<\/ac:task>/gi, (_match, inner) => {
    const statusMatch = inner.match(/<ac:task-status>([\s\S]*?)<\/ac:task-status>/i);
    const bodyMatch = inner.match(/<ac:task-body>([\s\S]*?)<\/ac:task-body>/i);
    const checked = statusMatch && statusMatch[1].trim() === "complete";
    const body = bodyMatch ? bodyMatch[1] : inner;
    return `<li>${checked ? "[x] " : "[ ] "}${body}</li>`;
  });

  // --- Cleanup: remove any remaining ac:*/ri:* tags, keep text content ---
  out = out.replace(/<\/?(?:ac|ri):[^>]*>/gi, "");

  // Clean up CDATA remnants
  out = out.replace(/<!\[CDATA\[/g, "");
  out = out.replace(/\]\]>/g, "");

  // Strip attributes from th/td so Turndown sees clean cells
  out = out.replace(/<th[^>]*>/gi, "<th>");
  out = out.replace(/<td[^>]*>/gi, "<td>");

  // --- Normalize table rows to uniform column count ---
  // Turndown GFM requires every row to have the same number of cells.
  // Confluence tables often have irregular column spans.
  out = out.replace(/<table>([\s\S]*?)<\/table>/gi, (_match, tableInner) => {
    // Count cells per row
    const rows = tableInner.match(/<tr>[\s\S]*?<\/tr>/gi) ?? [];
    const cellCounts = rows.map((row: string) => {
      const cells = row.match(/<(?:th|td)>/gi);
      return cells ? cells.length : 0;
    });
    const maxCols = Math.max(0, ...cellCounts);
    if (maxCols === 0) return _match;

    // Pad short rows
    const paddedRows = rows.map((row: string, i: number) => {
      const deficit = maxCols - cellCounts[i];
      if (deficit <= 0) return row;
      const pad = "<td></td>".repeat(deficit);
      return row.replace(/<\/tr>/i, `${pad}</tr>`);
    });

    // Ensure first row uses <th> so Turndown generates a header row
    const rebuilt = tableInner.replace(/<tr>[\s\S]*?<\/tr>/gi, () => paddedRows.shift()!);
    return `<table>${rebuilt}</table>`;
  });

  // Clean up table internals so Turndown GFM can convert them
  out = out.replace(/<table>([\s\S]*?)<\/table>/gi, (_match, inner) => {
    let cleaned = inner;
    // Strip block-level wrappers inside cells
    cleaned = cleaned.replace(/<\/?p>/gi, "");
    cleaned = cleaned.replace(/<\/?span[^>]*>/gi, "");
    cleaned = cleaned.replace(/<\/?div[^>]*>/gi, "");
    // Convert <br> to space (markdown tables can't have line breaks)
    cleaned = cleaned.replace(/<br\s*\/?>/gi, " ");
    // Strip <tbody> wrapper — Turndown wants <table><thead><tr>…</tr></thead>…
    cleaned = cleaned.replace(/<\/?tbody>/gi, "");
    // Ensure first row uses <th> so Turndown sees a header
    let firstDone = false;
    cleaned = cleaned.replace(/<tr>([\s\S]*?)<\/tr>/gi, (trMatch: string, trInner: string) => {
      if (!firstDone) {
        firstDone = true;
        const promoted = trInner.replace(/<td>/gi, "<th>").replace(/<\/td>/gi, "</th>");
        return `<thead><tr>${promoted}</tr></thead>`;
      }
      return `<tr>${trInner}</tr>`;
    });
    return `<table>${cleaned}</table>`;
  });

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
