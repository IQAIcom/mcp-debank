export const sanitizeChainId = (output: string): string => {
	return output.toLowerCase().replace(/[^a-z0-9_-]/g, "");
};
