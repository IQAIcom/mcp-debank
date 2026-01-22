import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z
	.object({
		IQ_GATEWAY_URL: z.url().optional(),
		IQ_GATEWAY_KEY: z.string().min(1).optional(),

		DEBANK_API_KEY: z.string().min(1).optional(),

		// LLM configuration (optional)
		OPENROUTER_API_KEY: z.string().min(1).optional(),
		LLM_MODEL: z.string().default("openai/gpt-4.1-mini"),
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
