/**
 * Transaction Service
 * Handles transaction simulation and explanation operations
 */

import { config } from "../config.js";
import { createChildLogger } from "../lib/utils/index.js";
import { toMarkdown } from "../lib/utils/markdown-formatter.js";
import type { PreExecResult, TransactionExplanation } from "../types.js";
import { BaseService, type RequestOptions } from "./base.service.js";

const logger = createChildLogger("DeBank Transaction Service");

const logAndWrapError = (context: string, error: unknown): Error => {
	if (error instanceof Error) {
		logger.error(context, error);
		return error;
	}

	const wrappedError = new Error(String(error));
	logger.error(context, wrappedError);
	return wrappedError;
};

export class TransactionService extends BaseService {
	async preExecTransactionRaw(
		args: { tx: string; pending_tx_list?: string },
		options?: RequestOptions,
	): Promise<PreExecResult> {
		try {
			let txPayload: unknown;
			try {
				txPayload = JSON.parse(args.tx);
			} catch (error) {
				if (error instanceof SyntaxError) {
					throw new Error(
						`Invalid JSON format for tx: ${(error as SyntaxError).message}`,
					);
				}
				throw error;
			}

			let pendingPayload: unknown;
			if (args.pending_tx_list) {
				try {
					pendingPayload = JSON.parse(args.pending_tx_list);
				} catch (error) {
					if (error instanceof SyntaxError) {
						throw new Error(
							`Invalid JSON format for pending_tx_list: ${(error as SyntaxError).message}`,
						);
					}
					throw error;
				}
			}

			const body = {
				tx: txPayload,
				...(pendingPayload !== undefined
					? { pending_tx_list: pendingPayload }
					: {}),
			};

			return await this.postWithToolConfig<PreExecResult>(
				`${config.baseUrl}/wallet/pre_exec_tx`,
				body,
				options,
			);
		} catch (error) {
			throw logAndWrapError("Failed to simulate transaction", error);
		}
	}

	async preExecTransaction(args: {
		tx: string;
		pending_tx_list?: string;
	}): Promise<string> {
		const data = await this.preExecTransactionRaw(args);
		try {
			return toMarkdown(data, {
				title: "Transaction Simulation Result",
			});
		} catch (error) {
			throw logAndWrapError(
				"Failed to format transaction simulation result response",
				error,
			);
		}
	}

	async explainTransactionRaw(
		args: { tx: string },
		options?: RequestOptions,
	): Promise<TransactionExplanation> {
		try {
			let txPayload: unknown;
			try {
				txPayload = JSON.parse(args.tx);
			} catch (error) {
				if (error instanceof SyntaxError) {
					throw new Error(
						`Invalid JSON format for tx: ${(error as SyntaxError).message}`,
					);
				}
				throw error;
			}

			const body = {
				tx: txPayload,
			};

			return await this.postWithToolConfig<TransactionExplanation>(
				`${config.baseUrl}/wallet/explain_tx`,
				body,
				options,
			);
		} catch (error) {
			throw logAndWrapError("Failed to explain transaction", error);
		}
	}

	async explainTransaction(args: { tx: string }): Promise<string> {
		const data = await this.explainTransactionRaw(args);
		try {
			return toMarkdown(data, {
				title: "Transaction Explanation",
			});
		} catch (error) {
			throw logAndWrapError(
				"Failed to format transaction explanation response",
				error,
			);
		}
	}
}
