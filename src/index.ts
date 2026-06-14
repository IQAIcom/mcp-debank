#!/usr/bin/env -S node --no-node-snapshot

// Thin entry that enforces the Node engine BEFORE any transitive module
// loads. ESM hoists static imports, so a check in a file that also imports
// `fastmcp` would run too late — `fastmcp` -> `undici` references the global
// `File` (Node >= 20), which crashes module evaluation on Node 18 with a
// `ReferenceError` that obscures the real cause. Keep this file free of
// static imports from project or runtime-heavy modules.

// Keep in sync with engines.node in package.json.
const REQUIRED_MAJOR = 22;

const match = /^v(\d+)\./.exec(process.version);
const currentMajor = match ? Number(match[1]) : Number.NaN;

if (!Number.isFinite(currentMajor) || currentMajor < REQUIRED_MAJOR) {
	process.stderr.write(
		`[debank-mcp] Node ${process.version} is too old — this server requires Node >= ${REQUIRED_MAJOR}.\n` +
			`If you're launching from Claude Desktop or another MCP host, set the "command" field to an ` +
			`absolute path to a Node ${REQUIRED_MAJOR}+ binary (e.g. an nvm v${REQUIRED_MAJOR} path or ` +
			`/opt/homebrew/bin/node) instead of relying on the host's PATH.\n`,
	);
	process.exit(1);
}

await import("./bootstrap.js");
