// src/mcp/legacy/tool-metadata.import.test.ts
//
// Verifies that importing tool-metadata.js at runtime DOES NOT load any module
// with env-dependent side effects (services/index.ts, lib/entity-resolver.ts,
// lib/cache/cache-manager.ts). The probe runs in a child Node process with:
//   1. No env vars beyond PATH — so a transitive env.ts import triggers a
//      Zod parse failure (env.ts:18-29 requires DEBANK_API_KEY or both
//      IQ_GATEWAY_*).
//   2. cwd in a fresh tmp dir — so dotenv.config() can't find a developer's
//      .env to mask the failure.
//   3. DOTENV_CONFIG_PATH=/dev/null — belt-and-braces.

import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("tool-metadata side-effect-freeness", () => {
	it("dist build imports cleanly with NO env vars and NO service-module construction", () => {
		const repoRoot = path.resolve(
			path.dirname(fileURLToPath(import.meta.url)),
			"../../..",
		);
		const distPath = path.resolve(repoRoot, "dist/mcp/legacy/tool-metadata.js");
		const tmpCwd = mkdtempSync(path.join(tmpdir(), "debank-mcp-meta-"));
		const result = spawnSync(
			"node",
			[
				"--input-type=module",
				"-e",
				`import { TOOL_METADATA } from "${distPath}"; process.stdout.write(String(TOOL_METADATA.length));`,
			],
			{
				cwd: tmpCwd,
				env: {
					PATH: process.env.PATH ?? "",
					DOTENV_CONFIG_PATH: "/dev/null",
				},
				timeout: 5_000,
			},
		);
		expect(
			result.error,
			`spawnSync failed: ${result.error?.message ?? "no error reported"}; stderr: ${result.stderr.toString()}`,
		).toBeUndefined();
		expect(result.status, `stderr: ${result.stderr.toString()}`).toBe(0);
		expect(result.stdout.toString()).toBe("31");
	});
});
