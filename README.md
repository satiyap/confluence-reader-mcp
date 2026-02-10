# Confluence Reader MCP Server

[![npm version](https://img.shields.io/npm/v/@satiyap/confluence-reader-mcp.svg)](https://www.npmjs.com/package/@satiyap/confluence-reader-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An MCP server that lets AI assistants read Confluence Cloud pages as markdown, browse page trees, download image attachments, and diff content against local documentation.

## Features

- Fetch a single Confluence page as proper GitHub-flavored markdown (headings, tables, lists, code blocks)
- List child pages for recursive traversal
- Download image attachments by filename
- Compare local content against a Confluence page with a unified diff
- Supports scoped API tokens with Basic Auth

## Setup

### 1. Get a Confluence API Token

Create a scoped API token from your Atlassian account:
https://support.atlassian.com/confluence/kb/scoped-api-tokens-in-confluence-cloud/

### 2. Set Environment Variables

Add to your shell profile (`~/.zshrc`, `~/.bashrc`, etc.):

```bash
export CONFLUENCE_TOKEN="your_scoped_token"
export CONFLUENCE_EMAIL="your_email@example.com"
export CONFLUENCE_CLOUD_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Reload your shell or open a new terminal.

| Variable | Required | Description |
|----------|----------|-------------|
| `CONFLUENCE_TOKEN` | Yes | Scoped API token |
| `CONFLUENCE_EMAIL` | Yes | Email tied to your Atlassian account |
| `CONFLUENCE_CLOUD_ID` | One of these | Cloud ID — routes via `api.atlassian.com` |
| `CONFLUENCE_BASE_URL` | is required | Direct tenant URL, e.g. `https://your-org.atlassian.net` |

### 3. Add to MCP Config

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

Restart the MCP host to pick up the new server.

## Tools

### `confluence.fetch_page`

Fetches a single Confluence page by URL and returns its content as markdown. Lists any direct child pages at the bottom so the caller can decide which to fetch next.

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | string | Confluence page URL |

### `confluence.list_children`

Lists the direct child pages of a Confluence page without fetching their content. Useful for discovering page structure before fetching individual pages.

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | string | Confluence page URL |

### `confluence.fetch_image`

Downloads an image attachment from a Confluence page by filename. Returns the image as base64-encoded data.

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | string | Confluence page URL |
| `filename` | string | Attachment filename (e.g. `architecture.png`) |

### `confluence.compare`

Generates a git-style unified diff between a Confluence page and a local markdown string.

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | string | Confluence page URL |
| `localContent` | string | Local markdown to compare against |

Returns a JSON object with `additions`, `deletions`, `totalChanges`, and the full `diff`.

## Supported URL Formats

- `/wiki/spaces/SPACEKEY/pages/123456789/Page+Title`
- `/wiki/pages/viewpage.action?pageId=123456789`

## Security

- Credentials are read from environment variables only — never passed in config files.
- Use scoped tokens with the minimum permissions needed.

## Contributing

Contributions are welcome. Please open an issue or submit a pull request.

## License

MIT
