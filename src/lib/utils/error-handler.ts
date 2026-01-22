/**
 * Error handling utilities
 */

import axios from "axios";

/**
 * Extracts a user-friendly error message from an unknown error.
 * Handles Axios errors by extracting response data or message,
 * and falls back to converting other errors to Error instances.
 *
 * @param error - The error to extract a message from
 * @returns An Error instance with a descriptive message
 */
export function extractErrorMessage(error: unknown): Error {
	if (axios.isAxiosError(error)) {
		const errorPayload = error.response?.data ?? error.message;
		const errorMessage =
			typeof errorPayload === "string"
				? errorPayload
				: JSON.stringify(errorPayload);
		return new Error(errorMessage);
	}
	return error instanceof Error ? error : new Error(String(error));
}
