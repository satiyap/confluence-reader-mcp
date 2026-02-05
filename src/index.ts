#!/usr/bin/env node

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { extractConfluencePageId } from "./confluence/url.js";
import { fetchPageById } from "./confluence/client.js";
import { storageToText } from "./confluence/transform.js";
import { generateUnifiedDiff, generateDiffStats } from "./compare/diff.js";

const server = new McpServer({
  name: "confluence-reader-mcp",
  version: "0.1.0"
});

function getEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

server.tool(
  "confluence.fetch_doc",
  "Fetch a Confluence Cloud page by URL using env-scoped credentials, returning clean text for analysis.",
  {
    url: z.string().describe("Confluence page URL (e.g. /wiki/spaces/.../pages/<id>/...)"),
    includeStorageHtml: z.boolean().optional().describe("If true, also return original storage HTML")
  },
  async ({ url, includeStorageHtml }) => {
    const token = getEnv("CONFLUENCE_TOKEN");
    const cloudId = getEnv("CONFLUENCE_CLOUD_ID");
    const baseUrl = getEnv("CONFLUENCE_BASE_URL");
    
    if (!token) throw new Error("Missing CONFLUENCE_TOKEN env var (scoped API token required).");
    
    const pageId = extractConfluencePageId(url);
    const page = await fetchPageById({ token, cloudId, baseUrl }, pageId);
    
    const storage = page.body?.storage?.value ?? "";
    const text = storage ? storageToText(storage) : "";
    
    const payload = {
      pageId: page.id,
      title: page.title,
      status: page.status,
      version: page.version?.number,
      webui: page._links?.webui,
      extractedText: text,
      ...(includeStorageHtml ? { storageHtml: storage } : {})
    };
    
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }]
    };
  }
);

// Helper tool to generate git-style diffs between Confluence and local docs
server.tool(
  "docs.build_comparison_bundle",
  "Build a git-style unified diff comparing PRD/System Overview/System Design/LLD against a Confluence page text.",
  {
    confluenceText: z.string().describe("Text extracted from Confluence (output of confluence.fetch_doc.extractedText)"),
    prd: z.string().optional().describe("Local PRD text"),
    systemOverview: z.string().optional().describe("Local System Overview text"),
    systemDesign: z.string().optional().describe("Local System Design text"),
    lld: z.string().optional().describe("Local LLD text")
  },
  async (args) => {
    const diffs: Array<{
      name: string;
      diff: string;
      stats: { additions: number; deletions: number; changes: number };
    }> = [];
    
    const sections = [
      ["PRD", args.prd],
      ["System Overview", args.systemOverview],
      ["System Design", args.systemDesign],
      ["LLD", args.lld]
    ].filter(([, v]) => !!v && v.trim().length > 0);
    
    for (const [name, localText] of sections) {
      const docName = name as string;
      const diff = generateUnifiedDiff(
        args.confluenceText.trim(),
        localText!.trim(),
        `a/confluence`,
        `b/${docName.toLowerCase().replace(/\s+/g, '-')}`
      );
      
      const stats = generateDiffStats(args.confluenceText.trim(), localText!.trim());
      
      diffs.push({ name: docName, diff, stats });
    }
    
    const summary = {
      totalComparisons: diffs.length,
      diffs: diffs.map(d => ({
        document: d.name,
        additions: d.stats.additions,
        deletions: d.stats.deletions,
        totalChanges: d.stats.changes,
        diff: d.diff
      }))
    };
    
    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }]
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server failed:", err);
  process.exit(1);
});
