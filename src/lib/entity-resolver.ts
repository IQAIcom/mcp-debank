import { chainIds } from "../enums/chains.js";
import { chainService } from "../services/index.js";
import type { ChainInfo } from "../types.js";
import { createChildLogger } from "./utils/index.js";

const logger = createChildLogger("DeBank Entity Resolver");

const WRAPPED_TOKEN_KEYWORDS = [
	"weth",
	"wbnb",
	"wmatic",
	"wavax",
	"wrapped",
	"native",
	"wrapped native",
	"native token",
] as const;

/**
 * Aliases for inputs that share zero substring with DeBank's `chain.name` and
 * so won't resolve via steps 1, 2, or 4 of resolveChain. Anything that exact-
 * matches an ID/name, or whose name contains the other as a substring, does
 * NOT belong here — it's already covered. Keep this table small; grow only
 * when a real user-facing failure surfaces.
 */
const CHAIN_ALIASES: Record<string, string> = {
	binance: "bsc",
	"binance smart chain": "bsc",
	okexchain: "okt",
	"okx chain": "okt",
	"okt chain": "okt",
	huobi: "heco",
	"huobi eco chain": "heco",
};

const CHAIN_LIST_TTL_MS = 24 * 60 * 60 * 1000;
let chainListCache: { chains: ChainInfo[]; loadedAt: number } | null = null;

/**
 * Fetch DeBank's supported chain catalog. Cached 24h; on network failure falls
 * back to the bundled static catalog so resolution always has SOMETHING to work
 * with — at the cost of possibly missing chains DeBank added since the last
 * package release.
 */
async function getChainList(): Promise<ChainInfo[]> {
	const now = Date.now();
	if (chainListCache && now - chainListCache.loadedAt < CHAIN_LIST_TTL_MS) {
		return chainListCache.chains;
	}
	try {
		const chains = await chainService.getSupportedChainListRaw();
		chainListCache = { chains, loadedAt: now };
		return chains;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		logger.warn(
			`Failed to fetch chain list from DeBank, falling back to bundled catalog: ${msg}`,
		);
		return chainIds as unknown as ChainInfo[];
	}
}

/**
 * True when `str` is exactly one of the wrapped-token keywords
 * resolveWrappedToken can resolve to an address. Returns false for
 * 0x-addresses (already an address; no resolution needed) and for any other
 * string that isn't an exact (case-insensitive) keyword match.
 *
 * Exact match — not substring — so pair/LP symbols that merely contain a
 * keyword ("WETH-USDT", "native-usdt-pool") are NOT misresolved to the
 * chain's wrapped native address.
 *
 * Private — the keyword set is implementation detail of resolveWrappedToken.
 */
function isWrappedTokenKeyword(str: string | undefined): boolean {
	if (!str) return false;
	const s = String(str).trim();
	if (/^0x[a-f0-9]{40}$/i.test(s)) return false;
	const lower = s.toLowerCase();
	return (WRAPPED_TOKEN_KEYWORDS as readonly string[]).includes(lower);
}

/**
 * Resolve a user-facing chain name/alias to a DeBank chain ID using DeBank's
 * own chain catalog (cached). Match order:
 *   1. exact ID (case-insensitive)
 *   2. exact name (case-insensitive)
 *   3. alias table
 *   4. substring match on name (either direction)
 * Returns null when nothing matches.
 */
export async function resolveChain(input: string): Promise<string | null> {
	if (typeof input !== "string") return null;
	const trimmed = input.trim();
	if (!trimmed) return null;
	const lower = trimmed.toLowerCase();

	const chains = await getChainList();

	const byId = chains.find((c) => c.id.toLowerCase() === lower);
	if (byId) return byId.id;

	const byName = chains.find((c) => c.name.toLowerCase() === lower);
	if (byName) return byName.id;

	const aliasTarget = CHAIN_ALIASES[lower];
	if (aliasTarget) {
		const verified = chains.find((c) => c.id === aliasTarget);
		if (verified) return verified.id;
		logger.warn(
			`Alias "${trimmed}" -> "${aliasTarget}" but that ID is not in DeBank's current chain list`,
		);
	}

	const byPartial = chains.find((c) => {
		const name = c.name.toLowerCase();
		return name.includes(lower) || lower.includes(name);
	});
	if (byPartial) return byPartial.id;

	logger.warn(`Could not resolve chain: "${input}"`);
	return null;
}

export async function resolveChains(
	commaSeparated: string,
): Promise<string | null> {
	try {
		const names = commaSeparated.split(",").map((name) => name.trim());
		const resolved = await Promise.all(names.map((n) => resolveChain(n)));
		if (resolved.some((id) => id === null)) {
			logger.warn(`Failed to resolve some chains in: ${commaSeparated}`);
			return null;
		}
		const result = resolved.join(",");
		logger.info(`Resolved chains "${commaSeparated}" -> "${result}"`);
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
 * resolveWrappedToken is exposed to Code Mode agents as
 * `debank.resolveWrappedToken(keyword, chainId)`. We validate the keyword
 * here so unrelated symbols like "USDT" don't silently return the chain's
 * wrapped native address. Uses the bundled chains.ts catalog (wrapped token
 * addresses are stable contracts — no need to fetch from DeBank).
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
			`Resolved wrapped token "${tokenKeyword}" on ${chain.name} -> "${chain.wrappedTokenId}"`,
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
