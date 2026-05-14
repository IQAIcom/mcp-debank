// tests/integration/lazy-isolated-vm.test.ts
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);
const registerPath = path.resolve(
	repoRoot,
	"tests/integration/no-isolated-vm.register.mjs",
);
const entrypoint = path.resolve(repoRoot, "dist/index.js");

describe("lazy isolated-vm", () => {
	it("server starts without loading isolated-vm; search_docs works; execute fails", async () => {
		const tmpCwd = mkdtempSync(path.join(tmpdir(), "debank-mcp-lazy-"));
		const child = spawn(
			"node",
			[
				"--no-node-snapshot",
				"--import",
				registerPath,
				entrypoint,
				"--legacy-tools",
			],
			{
				cwd: tmpCwd,
				env: {
					PATH: process.env.PATH ?? "",
					NODE_ENV: "test",
					DEBANK_API_KEY: "test-key",
					DEBANK_MCP_LEGACY: "1",
					DOTENV_CONFIG_PATH: "/dev/null",
				},
			},
		);

		let stdoutBuf = "";
		const responses: Record<number, unknown> = {};
		const responseWaiters: Record<number, (val: unknown) => void> = {};
		child.stdout.on("data", (chunk: Buffer) => {
			stdoutBuf += chunk.toString();
			const parts = stdoutBuf.split("\n");
			stdoutBuf = parts.pop() ?? "";
			for (const raw of parts) {
				const line = raw.trim();
				if (!line) continue;
				try {
					const msg = JSON.parse(line) as {
						id?: number;
						result?: unknown;
						error?: unknown;
					};
					if (typeof msg.id === "number") {
						responses[msg.id] = msg;
						responseWaiters[msg.id]?.(msg);
					}
				} catch {
					/* not JSON — ignore */
				}
			}
		});

		const stderrBuf: string[] = [];
		child.stderr.on("data", (b: Buffer) => stderrBuf.push(b.toString()));

		const send = (msg: object) => child.stdin.write(`${JSON.stringify(msg)}\n`);
		const waitForId = (id: number, timeoutMs: number) =>
			new Promise<unknown>((resolve, reject) => {
				if (responses[id] !== undefined) return resolve(responses[id]);
				const timer = setTimeout(
					() =>
						reject(
							new Error(
								`Timed out waiting for response id=${id}. stderr: ${stderrBuf.join("")}`,
							),
						),
					timeoutMs,
				);
				responseWaiters[id] = (val) => {
					clearTimeout(timer);
					resolve(val);
				};
			});

		try {
			send({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2024-11-05",
					capabilities: {},
					clientInfo: { name: "lazy-test", version: "1" },
				},
			});
			await waitForId(1, 5_000);

			send({ jsonrpc: "2.0", method: "notifications/initialized" });

			send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
			const toolsResponse = (await waitForId(2, 5_000)) as {
				result?: { tools?: { name: string }[] };
			};
			const toolNames = toolsResponse.result?.tools?.map((t) => t.name) ?? [];

			expect(toolNames).toContain("execute");
			expect(toolNames).toContain("search_docs");
			expect(toolNames).toContain("debank_resolve");
			expect(toolNames).toContain("debank_get_supported_chain_list");
			expect(toolNames).toContain("debank_get_user_chain_balance");

			send({
				jsonrpc: "2.0",
				id: 3,
				method: "tools/call",
				params: {
					name: "search_docs",
					arguments: { query: "get token balance" },
				},
			});
			const searchResponse = (await waitForId(3, 5_000)) as {
				result?: {
					content?: { type: string; text: string }[];
					isError?: boolean;
				};
			};
			expect(searchResponse.result?.isError).toBe(false);
			const searchInner = JSON.parse(
				searchResponse.result?.content?.[0]?.text ?? "{}",
			) as {
				results?: { name?: string }[];
			};
			expect(searchInner.results?.length).toBeGreaterThan(0);
			expect(
				searchInner.results?.some(
					(r) => r.name === "debank_get_user_token_balance",
				),
			).toBe(true);

			send({
				jsonrpc: "2.0",
				id: 4,
				method: "tools/call",
				params: {
					name: "execute",
					arguments: { code: "async function run(){ return 1; }" },
				},
			});
			const execResponse = (await waitForId(4, 5_000)) as {
				result?: {
					content?: { type: string; text: string }[];
					isError?: boolean;
				};
			};
			expect(execResponse.result?.isError).toBe(true);
			const innerText = execResponse.result?.content?.[0]?.text ?? "";
			const inner = JSON.parse(innerText) as { ok: boolean; error?: string };
			expect(inner.ok).toBe(false);
			expect(inner.error).toMatch(/isolated-vm native module failed to load/);
			expect(inner.error).toMatch(/pnpm rebuild isolated-vm/);
		} finally {
			try {
				child.stdin.end();
			} catch {
				/* already closed */
			}
			const exited = new Promise<void>((resolve) => {
				if (child.exitCode !== null || child.signalCode !== null)
					return resolve();
				child.once("exit", () => resolve());
				child.once("close", () => resolve());
			});
			if (!child.killed) child.kill();
			const sigtermTimer: { fired: boolean } = { fired: false };
			await Promise.race([
				exited,
				new Promise<void>((resolve) => {
					const t = setTimeout(() => {
						sigtermTimer.fired = true;
						if (
							!child.killed ||
							(child.exitCode === null && child.signalCode === null)
						) {
							child.kill("SIGKILL");
						}
						resolve();
					}, 2_000);
					t.unref?.();
				}),
			]);
			if (
				sigtermTimer.fired &&
				child.exitCode === null &&
				child.signalCode === null
			) {
				await Promise.race([
					exited,
					new Promise<void>((resolve) => {
						const t = setTimeout(resolve, 1_000);
						t.unref?.();
					}),
				]);
			}
		}
	}, 30_000);
});
