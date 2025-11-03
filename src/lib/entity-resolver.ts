import endent from "endent";
import { chainIds } from "../enums/chains.js";
import { cachedContentName } from "./cache/cache-manager.js";
import { createResolver } from "./resolvers/base-resolver.js";
import { createChildLogger } from "./utils/index.js";
import { sanitizeChainId } from "./utils/sanitizers.js";
import { needsResolution } from "./utils/validators.js";

const logger = createChildLogger("DeBank Entity Resolver");

export { needsResolution };

const chainResolver = createResolver({
	entityType: "chain",
	cacheName: cachedContentName,
	entities: chainIds,
	getContext: (entities) =>
		entities.map((chain) => `${chain.name}: ${chain.id}`).join("\n"),
	sanitize: sanitizeChainId,
	validate: (chainId, entities) =>
		entities.some((chain) => chain.id === chainId),
	fallbackPrompt: (name, context) => endent`
		You are a blockchain chain resolver. Given a user's input for a blockchain name, find the matching DeBank chain ID.

		Available chains (format: Name: id):
		${context}

		User input: "${name}"

		Rules:
		1. Match the user input to the most appropriate chain from the list
		2. Handle common variations and abbreviations (e.g., "BSC" = "BNB Chain", "Polygon" = "Polygon", "ETH" = "Ethereum")
		3. Return ONLY the chain ID (the part after the colon), nothing else
		4. If no match is found, return the exact token "__NOT_FOUND__"

		Examples:
		- Input: "Ethereum" → Output: eth
		- Input: "BSC" → Output: bsc
		- Input: "Binance Smart Chain" → Output: bsc
		- Input: "Polygon" → Output: matic
		- Input: "Arbitrum" → Output: arb
		- Input: "Made Up Chain" → Output: __NOT_FOUND__

		Your response (chain ID only, or "__NOT_FOUND__" if no match):
	`,
});

export async function resolveChain(name: string): Promise<string | null> {
	const resolver = await chainResolver;
	return await resolver(name);
}

export async function resolveChains(
	commaSeparated: string,
): Promise<string | null> {
	try {
		const names = commaSeparated.split(",").map((name) => name.trim());

		const resolvedPromises = names.map((name) => {
			if (!needsResolution(name, "chain")) {
				return Promise.resolve(name);
			}
			return resolveChain(name);
		});

		const resolved = await Promise.all(resolvedPromises);

		if (resolved.some((id) => id === null)) {
			logger.warn(`Failed to resolve some chains in: ${commaSeparated}`);
			return null;
		}

		const result = resolved.join(",");
		logger.info(`Resolved chains "${commaSeparated}" → "${result}"`);
		return result;
	} catch (error) {
		logger.error(
			`Error resolving comma-separated chains ${commaSeparated}:`,
			error,
		);
		return null;
	}
}

export function resolveWrappedToken(
	tokenKeyword: string,
	chainId: string,
): string | null {
	try {
		const chain = chainIds.find((c) => c.id === chainId);

		if (!chain) {
			logger.warn(`Chain not found for ID: ${chainId}`);
			return null;
		}

		if (!chain.wrappedTokenId || chain.wrappedTokenId.trim() === "") {
			logger.warn(
				`Chain ${chainId} (${chain.name}) does not have a wrapped token address`,
			);
			return null;
		}

		logger.info(
			`Resolved wrapped token "${tokenKeyword}" on ${chain.name} → "${chain.wrappedTokenId}"`,
		);
		return chain.wrappedTokenId;
	} catch (error) {
		logger.error(
			`Error resolving wrapped token ${tokenKeyword} on chain ${chainId}:`,
			error,
		);
		return null;
	}
}

export async function resolveEntities(
	args: Record<string, unknown>,
): Promise<void> {
	if (
		args.chain_id &&
		typeof args.chain_id === "string" &&
		needsResolution(args.chain_id, "chain")
	) {
		const resolved = await resolveChain(args.chain_id);
		if (resolved) {
			args.chain_id = resolved;
		}
	}

	if (
		args.chain_ids &&
		typeof args.chain_ids === "string" &&
		needsResolution(args.chain_ids, "chain")
	) {
		const resolved = await resolveChains(args.chain_ids);
		if (resolved) {
			args.chain_ids = resolved;
		}
	}

	if (
		args.token_id &&
		typeof args.token_id === "string" &&
		args.chain_id &&
		typeof args.chain_id === "string" &&
		needsResolution(args.token_id, "token")
	) {
		const resolved = resolveWrappedToken(args.token_id, args.chain_id);
		if (resolved) {
			args.token_id = resolved;
		}
	}

	if (
		args.id &&
		typeof args.id === "string" &&
		args.chain_id &&
		typeof args.chain_id === "string" &&
		needsResolution(args.id, "token")
	) {
		const resolved = resolveWrappedToken(args.id, args.chain_id);
		if (resolved) {
			args.id = resolved;
		}
	}
}
