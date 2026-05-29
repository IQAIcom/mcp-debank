import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { z } from "zod";

// Load .env from the SCRIPT's directory's parent (repo root for dev,
// install-dir parent for pnpm dlx), not just process cwd — MCP hosts like
// Claude Desktop spawn `node` with a cwd that isn't the repo, so the default
// dotenv.config() would never find a developer's .env.
// quiet: true suppresses dotenv@17's "[dotenv@17.x.x] injecting env..." stdout
// banner, which would otherwise corrupt the MCP JSON-RPC stream over stdio.
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
config({ quiet: true, path: path.resolve(scriptDir, "../.env") });
// Also load from cwd as a fallback (no-op if the file above already set vars
// — dotenv's default is { override: false }).
config({ quiet: true });

const envSchema = z
	.object({
		IQ_GATEWAY_URL: z.url().optional(),
		IQ_GATEWAY_KEY: z.string().min(1).optional(),

		DEBANK_API_KEY: z.string().min(1).optional(),

		GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
	})
	.refine(
		(env) => {
			const hasDebank = Boolean(env.DEBANK_API_KEY);
			const hasGateway =
				Boolean(env.IQ_GATEWAY_URL) && Boolean(env.IQ_GATEWAY_KEY);
			return hasDebank || hasGateway;
		},
		{
			message:
				"Provide either DEBANK_API_KEY or both IQ_GATEWAY_URL and IQ_GATEWAY_KEY",
		},
	);

export const env = envSchema.parse(process.env);
