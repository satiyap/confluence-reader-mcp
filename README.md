# Confluence Reader MCP Server

[![npm version](https://img.shields.io/npm/v/@satiyap/confluence-reader-mcp.svg)](https://www.npmjs.com/package/@satiyap/confluence-reader-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)

MCP server for fetching and comparing Confluence documentation with local files. Enables AI assistants to read Confluence pages and generate git-style diffs against local documentation.

## Features

- **URL-based fetching**: Pass any Confluence page URL, automatically extracts page ID
- **Clean text extraction**: Converts Confluence storage HTML to readable text/markdown
- **Git-style diffs**: Generate unified diffs comparing Confluence docs with local documentation
- **Flexible auth**: Supports scoped API tokens with Bearer authentication
- **Dual routing**: Works with cloudId routing or direct baseUrl
- **Zero install**: Use via `npx` for frictionless setup

## Quick Start

### 1. Set Environment Variables

Get your scoped API token from: https://support.atlassian.com/confluence/kb/scoped-api-tokens-in-confluence-cloud/

```bash
export CONFLUENCE_TOKEN="your_scoped_token_here"
export CONFLUENCE_CLOUD_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Or copy `.env.example` to `.env` and fill in your values.

### 2. Install Dependencies & Build

```bash
npm install
npm run build
```

### 3. Configure MCP

Add to your MCP settings configuration file (e.g., `mcp.json` or similar):

```json
{
  "mcpServers": {
    "confluence-reader": {
      "command": "npx",
      "args": ["@satiyap/confluence-reader-mcp"],
      "env": {
        "CONFLUENCE_TOKEN": "${env:CONFLUENCE_TOKEN}",
        "CONFLUENCE_CLOUD_ID": "${env:CONFLUENCE_CLOUD_ID}"
      }
    }
  }
}
```

Or using the simplified `servers` format:

```json
{
  "servers": {
    "confluence-reader": {
      "command": "npx",
      "args": ["@satiyap/confluence-reader-mcp"]
    }
  }
}
```

**Note:** Environment variables must be set in your shell before starting the MCP host.

### 4. Restart Your MCP Host

Restart your MCP-compatible application to load the server.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CONFLUENCE_TOKEN` | ✅ Yes | [Scoped API token](https://support.atlassian.com/confluence/kb/scoped-api-tokens-in-confluence-cloud/) (Bearer auth only) |
| `CONFLUENCE_CLOUD_ID` | Recommended | Atlassian Cloud ID for api.atlassian.com routing |
| `CONFLUENCE_BASE_URL` | Optional | Fallback: `https://yourtenant.atlassian.net` |

**Authentication:**
- Only supports scoped API tokens with Bearer authentication
- No email/password or Basic auth support

**Routing:**
- If `CONFLUENCE_CLOUD_ID` is set → Uses `https://api.atlassian.com/ex/confluence/{cloudId}`
- Otherwise uses `CONFLUENCE_BASE_URL`

## Available Tools

### `confluence.fetch_doc`

Fetch a Confluence Cloud page by URL, returning clean text for analysis.

**Parameters:**
- `url` (string, required): Confluence page URL
  - Supports: `/wiki/spaces/KEY/pages/123456789/Title`
  - Supports: `/wiki/pages/viewpage.action?pageId=123456789`
- `includeStorageHtml` (boolean, optional): If true, also returns original storage HTML

**Returns:**
```json
{
  "pageId": "123456789",
  "title": "Page Title",
  "status": "current",
  "version": 42,
  "webui": "/wiki/spaces/...",
  "extractedText": "Clean text content...",
  "storageHtml": "..." // if includeStorageHtml=true
}
```

### `docs.build_comparison_bundle`

Build a git-style unified diff comparing local documentation against Confluence content.

**Parameters:**
- `confluenceText` (string, required): Text from `confluence.fetch_doc.extractedText`
- `prd` (string, optional): Local document text (e.g., PRD, requirements)
- `systemOverview` (string, optional): Local document text (e.g., architecture overview)
- `systemDesign` (string, optional): Local document text (e.g., technical design)
- `lld` (string, optional): Local document text (e.g., detailed design, implementation notes)

**Note:** Parameter names are flexible - use them for any type of documentation you want to compare.

**Returns:**
```json
{
  "totalComparisons": 2,
  "diffs": [
    {
      "document": "PRD",
      "additions": 15,
      "deletions": 8,
      "totalChanges": 23,
      "diff": "--- a/confluence\n+++ b/prd\n@@ -1,5 +1,5 @@\n context line\n-removed line\n+added line\n context line"
    },
    {
      "document": "System Design",
      "additions": 42,
      "deletions": 12,
      "totalChanges": 54,
      "diff": "..."
    }
  ]
}
```

## Usage Example

When a user provides a Confluence URL in their prompt:

1. AI assistant detects the URL
2. Calls `confluence.fetch_doc` with the URL
3. Calls `docs.build_comparison_bundle` with:
   - `confluenceText` from step 2
   - Local documentation content from filesystem
4. AI assistant analyzes the structured comparison and reports differences

## Supported Confluence URL Formats

- `/wiki/spaces/SPACEKEY/pages/123456789/Page+Title`
- `/wiki/pages/viewpage.action?pageId=123456789`
- Any URL containing `/pages/<numeric-id>/`

## Project Structure

```
confluence-reader-mcp/
├── src/
│   ├── index.ts                    # MCP server + tool registrations
│   ├── confluence/
│   │   ├── client.ts               # HTTP client with scoped token auth
│   │   ├── url.ts                  # URL → pageId parser
│   │   ├── types.ts                # API response types
│   │   └── transform.ts            # Storage HTML → text converter
│   └── compare/
│       └── diff.ts                 # Git-style unified diff generator
├── dist/                           # Compiled output
├── package.json                    # Binary: confluence-reader-mcp
├── tsconfig.json
├── .env.example
├── .gitignore
└── README.md
```

## Development

```bash
npm run dev     # Run with tsx (no build needed)
npm run build   # Compile TypeScript
npm start       # Run compiled server
```

## Security Notes

- ✅ Never commit tokens to git (see `.gitignore`)
- ✅ Use scoped API tokens with minimal permissions
- ✅ Tokens are read from OS environment only
- ✅ No tokens in config files

## Publishing to npm (Optional)

Once ready for public use:

1. Update `package.json` with your repository URL and author info
2. Build the package:
   ```bash
   npm run build
   ```
3. Publish to npm:
   ```bash
   npm publish --access public
   ```

Then users can use the simplified config:
```json
{
  "servers": {
    "confluence-reader": {
      "command": "npx",
      "args": ["@satiyap/confluence-reader-mcp"]
    }
  }
}
```

**Note:** Environment variables (`CONFLUENCE_TOKEN`, `CONFLUENCE_CLOUD_ID`) must be set in the user's shell.

## API References

- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Confluence REST API v2](https://developer.atlassian.com/cloud/confluence/rest/v2/)
- [Atlassian Scoped API Tokens](https://support.atlassian.com/confluence/kb/scoped-api-tokens-in-confluence-cloud/)

## License

MIT
