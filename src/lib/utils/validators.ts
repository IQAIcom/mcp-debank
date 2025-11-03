const NOT_FOUND_TOKEN = "__NOT_FOUND__";

export const isNotFoundResponse = (output: string): boolean => {
	return output.toUpperCase().includes(NOT_FOUND_TOKEN);
};

export function needsResolution(
	value: string | undefined,
	type: "chain" | "token",
): boolean {
	if (!value) return false;
	const str = String(value);

	if (type === "chain") {
		return /[A-Z\s]/.test(str);
	}

	if (type === "token") {
		if (str.startsWith("0x") && str.length === 42) {
			return false;
		}

		const wrappedTokenKeywords = [
			"weth",
			"wbnb",
			"wmatic",
			"wavax",
			"wrapped",
			"native",
		];

		const lowerStr = str.toLowerCase();
		return wrappedTokenKeywords.some((keyword) => lowerStr.includes(keyword));
	}

	return false;
}
