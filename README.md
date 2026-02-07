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

Add these to your shell profile (`~/.zshrc`, `~/.bashrc`, etc.):

```bash
export CONFLUENCE_TOKEN="your_scoped_token_here"
export CONFLUENCE_EMAIL="your.email@company.com"
export CONFLUENCE_CLOUD_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Then reload your shell (`source ~/.zshrc`) or open a new terminal.

Get your scoped API token from: https://support.atlassian.com/confluence/kb/scoped-api-tokens-in-confluence-cloud/

### 2. Configure MCP

Add to your MCP settings (`mcp.json`). No `env` block needed — credentials come from `.env`:

```json
{
  "mcpServers": {
    "confluence-reader": {
      "command": "npx",
      "args": ["@satiyap/confluence-reader-mcp"]
    }
  }
}
```

### 3. Restart Your MCP Host

Restart your MCP-compatible application to load the server.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CONFLUENCE_TOKEN` | ✅ Yes | [Scoped API token](https://support.atlassian.com/confluence/kb/scoped-api-tokens-in-confluence-cloud/) |
| `CONFLUENCE_EMAIL` | ✅ Yes | Email address associated with your Atlassian account |
| `CONFLUENCE_CLOUD_ID` | Recommended | Atlassian Cloud ID for api.atlassian.com routing |
| `CONFLUENCE_BASE_URL` | Optional | Fallback: `https://yourtenant.atlassian.net` |

**Authentication:**
- Uses scoped API tokens with Basic authentication (email:token)
- Scoped tokens provide granular access control and better security than legacy API tokens

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

- ✅ Credentials read from OS environment variables only — never in config files
- ✅ Never commit tokens to git
- ✅ Use scoped API tokens with minimal permissions

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

Then users can use this minimal config (no env block needed):
```json
{
  "mcpServers": {
    "confluence-reader": {
      "command": "npx",
      "args": ["@satiyap/confluence-reader-mcp"]
    }
  }
}
```

**Note:** Users must set `CONFLUENCE_TOKEN`, `CONFLUENCE_EMAIL`, and `CONFLUENCE_CLOUD_ID` as OS environment variables.

## API References

- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Confluence REST API v2](https://developer.atlassian.com/cloud/confluence/rest/v2/)
- [Atlassian Scoped API Tokens](https://support.atlassian.com/confluence/kb/scoped-api-tokens-in-confluence-cloud/)

## License

MIT
