/**
 * Transaction Service
 * Handles transaction simulation and explanation operations
 */

import { config } from "../config.js";
import { createChildLogger } from "../lib/utils/index.js";
import type { PreExecResult, TransactionExplanation } from "../types.js";
import { BaseService } from "./base.service.js";

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
	async preExecTransaction(args: {
		tx: string;
		pending_tx_list?: string;
	}): Promise<string> {
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

			const data = await this.postWithToolConfig<PreExecResult>(
				`${config.baseUrl}/wallet/pre_exec_tx`,
				body,
			);
			return await this.formatResponse(data, {
				title: "Transaction Simulation Result",
			});
		} catch (error) {
			throw logAndWrapError("Failed to simulate transaction", error);
		}
	}

	async explainTransaction(args: { tx: string }): Promise<string> {
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

			const data = await this.postWithToolConfig<TransactionExplanation>(
				`${config.baseUrl}/wallet/explain_tx`,
				body,
			);
			return await this.formatResponse(data, {
				title: "Transaction Explanation",
			});
		} catch (error) {
			throw logAndWrapError("Failed to explain transaction", error);
		}
	}
}
