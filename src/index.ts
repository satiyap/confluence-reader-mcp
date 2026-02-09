#!/usr/bin/env node

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { extractConfluencePageId } from "./confluence/url.js";
import { fetchPageById, fetchChildPages, buildAuthHeaders, buildBase, type ConfluenceClientConfig } from "./confluence/client.js";
import { storageToText } from "./confluence/transform.js";
import { generateUnifiedDiff, generateDiffStats } from "./compare/diff.js";

const server = new McpServer({
  name: "confluence-reader-mcp",
  version: "0.1.2"
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

server.tool(
  "confluence.fetch_page",
  "Fetch a Confluence page and return it as markdown.",
  {
    url: z.string().describe("Confluence page URL")
  },
  async ({ url }) => {
    const token = getEnv("CONFLUENCE_TOKEN")!;
    const email = getEnv("CONFLUENCE_EMAIL")!;
    const cloudId = getEnv("CONFLUENCE_CLOUD_ID");
    const baseUrl = getEnv("CONFLUENCE_BASE_URL");
    const cfg = { token, email, cloudId, baseUrl };
    
    const pageId = extractConfluencePageId(url);
    const page = await fetchPageById(cfg, pageId);
    const children = await fetchChildPages(cfg, pageId);
    
    const storage = page.body?.storage?.value ?? "";
    const markdown = storage ? storageToText(storage) : "";
    
    const childLinks = children.map(c => `- [${c.title}] (id: ${c.id})`).join("\n");
    const body = childLinks
      ? `${markdown}\n\n## Child Pages\n${childLinks}`
      : markdown;
    
    return {
      content: [{ type: "text", text: body }]
    };
  }
);

server.tool(
  "confluence.fetch_page_tree",
  "Fetch a Confluence page and all its child pages recursively up to a specified depth.",
  {
    url: z.string().describe("Confluence page URL"),
    depth: z.number().optional().default(1).describe("How many levels deep to fetch child pages (default: 1)")
  },
  async ({ url, depth }) => {
    const token = getEnv("CONFLUENCE_TOKEN")!;
    const email = getEnv("CONFLUENCE_EMAIL")!;
    const cloudId = getEnv("CONFLUENCE_CLOUD_ID");
    const baseUrl = getEnv("CONFLUENCE_BASE_URL");
    const cfg = { token, email, cloudId, baseUrl };

    const pageId = extractConfluencePageId(url);

    type PageNode = { id: string; title: string; content: string; children: PageNode[] };

    async function buildTree(id: string, remaining: number): Promise<PageNode> {
      const page = await fetchPageById(cfg, id);
      const storage = page.body?.storage?.value ?? "";
      const content = storage ? storageToText(storage) : "";

      const children: PageNode[] = [];
      if (remaining > 0) {
        const childPages = await fetchChildPages(cfg, id);
        for (const child of childPages) {
          children.push(await buildTree(child.id, remaining - 1));
        }
      }

      return { id: page.id, title: page.title, content, children };
    }

    const tree = await buildTree(pageId, depth);

    function renderTree(node: PageNode, level: number): string {
      const heading = "#".repeat(Math.min(level + 1, 6));
      const parts = [`${heading} ${node.title}`, node.content];
      for (const child of node.children) {
        parts.push(renderTree(child, level + 1));
      }
      return parts.join("\n\n");
    }

    return {
      content: [{ type: "text", text: renderTree(tree, 0) }]
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
    const token = getEnv("CONFLUENCE_TOKEN")!;
    const email = getEnv("CONFLUENCE_EMAIL")!;
    const cloudId = getEnv("CONFLUENCE_CLOUD_ID");
    const baseUrl = getEnv("CONFLUENCE_BASE_URL");
    
    const pageId = extractConfluencePageId(url);
    const page = await fetchPageById({ token, email, cloudId, baseUrl }, pageId);
    
    const storage = page.body?.storage?.value ?? "";
    const confluenceMarkdown = storage ? storageToText(storage) : "";
    
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
