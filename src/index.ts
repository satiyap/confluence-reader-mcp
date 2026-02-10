#!/usr/bin/env node

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { extractConfluencePageId } from "./confluence/url.js";
import { fetchPageById, fetchChildPages, fetchAttachments, downloadAttachment, buildAuthHeaders, buildBase, type ConfluenceClientConfig } from "./confluence/client.js";
import { storageToMarkdown } from "./confluence/transform.js";
import { generateUnifiedDiff, generateDiffStats } from "./compare/diff.js";

const server = new McpServer({
  name: "confluence-reader-mcp",
  version: "0.2.0"
});

function getEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

function validateEnvironment(): void {
  const token = getEnv("CONFLUENCE_TOKEN");
  const email = getEnv("CONFLUENCE_EMAIL");
  
  const errors: string[] = [];
  
  if (!token) {
    errors.push("CONFLUENCE_TOKEN is required (get a scoped API token from: https://support.atlassian.com/confluence/kb/scoped-api-tokens-in-confluence-cloud/)");
  }
  
  if (!email) {
    errors.push("CONFLUENCE_EMAIL is required (email address associated with your Atlassian account)");
  }
  
  const cloudId = getEnv("CONFLUENCE_CLOUD_ID");
  const baseUrl = getEnv("CONFLUENCE_BASE_URL");
  
  if (!cloudId && !baseUrl) {
    errors.push("Either CONFLUENCE_CLOUD_ID or CONFLUENCE_BASE_URL must be set");
  }
  
  if (errors.length > 0) {
    console.error("\n❌ Environment configuration errors:\n");
    errors.forEach(err => console.error(`  • ${err}`));
    console.error("\nSet the required environment variables in your shell profile (~/.zshrc, ~/.bashrc, etc.):\n");
    console.error("  export CONFLUENCE_TOKEN=\"your_scoped_token\"");
    console.error("  export CONFLUENCE_EMAIL=\"you@company.com\"");
    console.error("  export CONFLUENCE_CLOUD_ID=\"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\"\n");
    process.exit(1);
  }
}

/** Build config from env vars */
function getCfg(): ConfluenceClientConfig {
  return {
    token: getEnv("CONFLUENCE_TOKEN")!,
    email: getEnv("CONFLUENCE_EMAIL")!,
    cloudId: getEnv("CONFLUENCE_CLOUD_ID"),
    baseUrl: getEnv("CONFLUENCE_BASE_URL"),
  };
}

server.tool(
  "confluence.fetch_page",
  "Fetch a Confluence page as markdown. Returns the page content and lists any direct child pages so the caller can decide which children to fetch next.",
  {
    url: z.string().describe("Confluence page URL"),
  },
  async ({ url }) => {
    const cfg = getCfg();
    const pageId = extractConfluencePageId(url);
    const page = await fetchPageById(cfg, pageId);
    const children = await fetchChildPages(cfg, pageId);

    const storage = page.body?.storage?.value ?? "";
    const markdown = storage ? storageToMarkdown(storage) : "";

    const childList = children.length > 0
      ? `\n\n---\n## Child Pages\n${children.map(c => `- ${c.title} (id: ${c.id})`).join("\n")}`
      : "";

    return {
      content: [{
        type: "text",
        text: `# ${page.title}\n\n${markdown}${childList}`
      }]
    };
  }
);

server.tool(
  "confluence.list_children",
  "List the direct child pages of a Confluence page without fetching their content. Useful for discovering page structure before fetching individual pages.",
  {
    url: z.string().describe("Confluence page URL")
  },
  async ({ url }) => {
    const cfg = getCfg();
    const pageId = extractConfluencePageId(url);
    const children = await fetchChildPages(cfg, pageId);

    const lines = children.map(c => `- ${c.title} (id: ${c.id})`);
    const text = lines.length > 0
      ? `Found ${lines.length} child page(s):\n\n${lines.join("\n")}`
      : "No child pages found.";

    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "confluence.fetch_image",
  "Download an image attachment from a Confluence page by filename. Returns the image as base64-encoded data.",
  {
    url: z.string().describe("Confluence page URL"),
    filename: z.string().describe("Attachment filename (e.g. 'architecture.png')")
  },
  async ({ url, filename }) => {
    const cfg = getCfg();
    const pageId = extractConfluencePageId(url);
    const attachments = await fetchAttachments(cfg, pageId);

    const match = attachments.find(a =>
      a.title.toLowerCase() === filename.toLowerCase()
    );

    if (!match) {
      const available = attachments.map(a => a.title).join(", ");
      return {
        content: [{
          type: "text" as const,
          text: `Attachment "${filename}" not found. Available: ${available || "none"}`
        }]
      };
    }

    const downloadLink = match.downloadLink ?? match._links?.download;
    if (!downloadLink) {
      return {
        content: [{
          type: "text" as const,
          text: `No download link available for "${filename}".`
        }]
      };
    }

    const { buffer, contentType } = await downloadAttachment(cfg, downloadLink);
    const base64 = buffer.toString("base64");

    // Return as base64 image content
    if (contentType.startsWith("image/")) {
      return {
        content: [{
          type: "image" as const,
          data: base64,
          mimeType: contentType,
        }]
      };
    }

    // Non-image attachment — return as base64 text
    return {
      content: [{
        type: "text" as const,
        text: `Downloaded "${filename}" (${contentType}, ${buffer.length} bytes).\nBase64: ${base64.slice(0, 200)}...`
      }]
    };
  }
);

server.tool(
  "confluence.compare",
  "Compare a local markdown file or string with a Confluence page and show the differences.",
  {
    url: z.string().describe("Confluence page URL"),
    localContent: z.string().describe("Local markdown content to compare against")
  },
  async ({ url, localContent }) => {
    const cfg = getCfg();
    
    const pageId = extractConfluencePageId(url);
    const page = await fetchPageById(cfg, pageId);
    
    const storage = page.body?.storage?.value ?? "";
    const confluenceMarkdown = storage ? storageToMarkdown(storage) : "";
    
    const diff = generateUnifiedDiff(
      confluenceMarkdown.trim(),
      localContent.trim(),
      `a/confluence/${page.title}`,
      `b/local`
    );
    
    const stats = generateDiffStats(confluenceMarkdown.trim(), localContent.trim());
    
    const result = {
      confluencePage: page.title,
      pageUrl: page._links?.webui,
      additions: stats.additions,
      deletions: stats.deletions,
      totalChanges: stats.changes,
      diff: diff
    };
    
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
    };
  }
);

async function validateAuthentication(): Promise<void> {
  const cfg: ConfluenceClientConfig = {
    token: getEnv("CONFLUENCE_TOKEN")!,
    email: getEnv("CONFLUENCE_EMAIL")!,
    cloudId: getEnv("CONFLUENCE_CLOUD_ID"),
    baseUrl: getEnv("CONFLUENCE_BASE_URL"),
  };

  const base = buildBase(cfg);
  const url = new URL(`${base}/wiki/api/v2/pages`);
  url.searchParams.set("limit", "1");

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        ...buildAuthHeaders(cfg),
        Accept: "application/json",
      },
    });

    if (res.status === 401) {
      console.error("\n❌ Authentication failed: Invalid token or email.");
      console.error("  Check your CONFLUENCE_TOKEN and CONFLUENCE_EMAIL.\n");
      process.exit(1);
    }

    if (res.status === 403) {
      console.error("\n❌ Authentication failed: Token lacks required permissions.");
      console.error("  Ensure your scoped token has read access to Confluence.\n");
      process.exit(1);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`\n❌ Confluence API error (${res.status}): ${text.slice(0, 300)}\n`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`\n❌ Could not reach Confluence API: ${(err as Error).message}`);
    console.error("  Check your network connection and CONFLUENCE_CLOUD_ID / CONFLUENCE_BASE_URL.\n");
    process.exit(1);
  }
}

async function main() {
  // Validate environment variables before starting the server
  validateEnvironment();

  // Verify credentials actually work against Confluence
  await validateAuthentication();
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server failed:", err);
  process.exit(1);
});
