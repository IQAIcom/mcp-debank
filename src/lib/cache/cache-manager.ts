import { GoogleAICacheManager } from "@google/generative-ai/server";
import { chainIds } from "../../enums/chains.js";
import { env } from "../../env.js";
import { createChildLogger } from "../utils/index.js";
import { chainsInstruction } from "./instructions.js";

const logger = createChildLogger("DeBank Cache Manager");
const gemini25Flash = "gemini-2.5-flash";

let cacheManager: GoogleAICacheManager | null = null;
export let cachedContentName: string | null = null;

export async function initializeCacheManager(): Promise<void> {
	if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
		logger.warn(
			"GOOGLE_GENERATIVE_AI_API_KEY not found, caching will be disabled",
		);
		return;
	}

	try {
		cacheManager = new GoogleAICacheManager(env.GOOGLE_GENERATIVE_AI_API_KEY);

		const chainList = chainIds
			.map((chain) => `${chain.name}: ${chain.id}`)
			.join("\n");

		const { name } = await cacheManager.create({
			model: gemini25Flash,
			systemInstruction: chainsInstruction,
			contents: [
				{
					role: "user",
					parts: [{ text: chainList }],
				},
			],
			ttlSeconds: 3600,
		});

		cachedContentName = name ?? null;
		logger.info(
			`✅ Chains cache initialized successfully (${cachedContentName})`,
		);
	} catch (error) {
		logger.error("Failed to initialize DeBank cache manager:", error);
		cacheManager = null;
		cachedContentName = null;
	}
}

initializeCacheManager().catch((error) => {
	logger.error("Error during cache initialization:", error);
});
