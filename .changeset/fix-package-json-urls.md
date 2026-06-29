---
"@iqai/mcp-debank": patch
---

Point `homepage`, `repository.url`, and `bugs.url` in `package.json` at the current canonical repo location `BrainDAO/mcp-debank`. The previous `IQOfficial/mcp-debank` URLs return 404 on GitHub (that org/repo doesn't exist; the repo lives at `BrainDAO/mcp-debank`, with `IQAIcom/mcp-debank` as a transfer-redirect). The npm "View repository" / "Report bugs" links currently point nowhere — this publish refreshes the npm registry metadata so those links resolve.
