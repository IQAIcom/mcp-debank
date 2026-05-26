const NOT_FOUND_TOKEN = "__NOT_FOUND__";

export const isNotFoundResponse = (output: string): boolean => {
	return output.toUpperCase().includes(NOT_FOUND_TOKEN);
};
