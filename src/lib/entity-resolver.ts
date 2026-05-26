import dedent from "dedent";
import { chainIds } from "../enums/chains.js";
import { cachedContentName } from "./cache/cache-manager.js";
import { createResolver } from "./resolvers/base-resolver.js";
import { createChildLogger } from "./utils/index.js";
import { sanitizeChainId } from "./utils/sanitizers.js";

const logger = createChildLogger("DeBank Entity Resolver");

const WRAPPED_TOKEN_KEYWORDS = [
	"weth",
	"wbnb",
	"wmatic",
	"wavax",
	"wrapped",
	"native",
] as const;

/**
 * True when `str` looks like a chain NAME (e.g. "Ethereum", "Binance Smart
 * Chain") rather than a DeBank chain ID (e.g. "eth"). Heuristic: presence of
 * uppercase letters or whitespace.
 *
 * Exported because tool-handlers.ts uses this to decide whether to pre-resolve
 * `args.id` as a chain name for `debank_get_chain`.
 */
export function looksLikeChainName(str: string | undefined): boolean {
	if (!str) return false;
	return /[A-Z\s]/.test(String(str));
}

/**
 * True when `str` is one of the wrapped-token keywords resolveWrappedToken
 * can resolve to an address. Returns false for 0x-addresses (already an
 * address; no resolution needed) and for any other string that doesn't
 * lowercase-contain one of the keywords.
 *
 * Private — the keyword set is implementation detail of resolveWrappedToken.
 */
function isWrappedTokenKeyword(str: string | undefined): boolean {
	if (!str) return false;
	const s = String(str);
	if (/^0x[a-f0-9]{40}$/i.test(s)) return false;
	const lower = s.toLowerCase();
	return WRAPPED_TOKEN_KEYWORDS.some((k) => lower.includes(k));
}

const chainResolver = createResolver({
	entityType: "chain",
	cacheName: cachedContentName,
	entities: chainIds,
	getContext: (entities) =>
		entities.map((chain) => `${chain.name}: ${chain.id}`).join("\n"),
	sanitize: sanitizeChainId,
	validate: (chainId, entities) =>
		entities.some((chain) => chain.id === chainId),
	fallbackPrompt: (name, context) => dedent`
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
			if (!looksLikeChainName(name)) {
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

/**
 * resolveWrappedToken is also exposed to Code Mode agents as
 * `debank.resolveWrappedToken(keyword, chainId)`. We must validate the
 * keyword here so unrelated symbols like "USDT" don't silently return the
 * chain's wrapped native address. The WRAPPED_TOKEN_KEYWORDS set is
 * co-located here — isWrappedTokenKeyword is its sole consumer.
 */
export function resolveWrappedToken(
	tokenKeyword: string,
	chainId: string,
): string | null {
	if (
		typeof tokenKeyword !== "string" ||
		!isWrappedTokenKeyword(tokenKeyword)
	) {
		return null;
	}
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
		looksLikeChainName(args.chain_id)
	) {
		const resolved = await resolveChain(args.chain_id);
		if (resolved) {
			args.chain_id = resolved;
		}
	}

	if (
		args.chain_ids &&
		typeof args.chain_ids === "string" &&
		looksLikeChainName(args.chain_ids)
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
		isWrappedTokenKeyword(args.token_id)
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
		isWrappedTokenKeyword(args.id)
	) {
		const resolved = resolveWrappedToken(args.id, args.chain_id);
		if (resolved) {
			args.id = resolved;
		}
	}
}
