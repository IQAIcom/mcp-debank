import type { UserTokenBalance } from "../types.js";

type MatchableHolding = Pick<
	UserTokenBalance,
	"id" | "name" | "symbol" | "display_symbol" | "optimized_symbol"
>;

// Canonical EVM address shape — mirrors entity-resolver.ts:78.
const ADDRESS_RE = /^0x[a-f0-9]{40}$/i;
// A trailing generic descriptor word, only when preceded by whitespace — so a
// sole-word "Coin"/"Token" (no leading space) is preserved.
const TRAILING_DESCRIPTOR_RE = /\s+(?:token|coin)$/i;

/** trim -> lower-case -> drop a trailing "token"/"coin" unless it is the only word. */
function normalize(value: string): string {
	const lowered = value.trim().toLowerCase();
	const stripped = lowered.replace(TRAILING_DESCRIPTOR_RE, "");
	return stripped.length > 0 ? stripped : lowered;
}

/**
 * True if `reference` (a user-supplied token name, symbol, or 0x address)
 * identifies `holding`. Exact match (never substring) on the normalized name,
 * symbol, display_symbol, or optimized_symbol; or a case-insensitive match of a
 * well-formed 0x address against the holding's id.
 */
export function matchesTokenReference(
	reference: string,
	holding: MatchableHolding,
): boolean {
	const ref = reference.trim();
	if (ref === "") return false;

	if (ADDRESS_RE.test(ref)) {
		return (
			typeof holding.id === "string" &&
			holding.id.toLowerCase() === ref.toLowerCase()
		);
	}

	const target = normalize(ref);
	const fields = [
		holding.name,
		holding.symbol,
		holding.display_symbol,
		holding.optimized_symbol,
	];
	return fields.some(
		(f) => typeof f === "string" && f.length > 0 && normalize(f) === target,
	);
}
