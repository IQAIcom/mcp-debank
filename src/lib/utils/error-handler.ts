// src/lib/utils/error-handler.ts
//
// Error handling utilities.

import axios from "axios";

/**
 * Extracts a user-friendly error message from an unknown error.
 * For AxiosError input, preserves `code` (e.g., ECONNABORTED, ETIMEDOUT)
 * and stores the original error in `cause` so downstream consumers (notably
 * the sandbox proxy timeout detection in src/mcp/execute/client.ts) can
 * distinguish axios timeouts from other failures.
 */
export function extractErrorMessage(error: unknown): Error {
	if (axios.isAxiosError(error)) {
		const errorPayload = error.response?.data ?? error.message;
		const errorMessage =
			typeof errorPayload === "string"
				? errorPayload
				: JSON.stringify(errorPayload);
		const wrapped = new Error(errorMessage, { cause: error }) as Error & {
			code?: string;
		};
		if (error.code) wrapped.code = error.code;
		return wrapped;
	}
	return error instanceof Error ? error : new Error(String(error));
}
