#!/usr/bin/env node
import { FastMCP } from "fastmcp";
import { createChildLogger } from "./lib/utils/logger.js";
import { debankTools } from "./tools/index.js";

const logger = createChildLogger("DeBank MCP");

/**
 * Initializes and starts the DeBank MCP (Model Context Protocol) Server.
 *
 * This server provides comprehensive blockchain and DeFi data including chain information,
 * protocol details, token data, user positions, NFT holdings, transaction history, and more
 * through the MCP protocol. The server communicates via stdio transport, making it suitable
 * for integration with MCP clients and AI agents.
 *
 * Key features:
 * - Chain data: Detailed information about supported blockchain networks
 * - Protocol analytics: DeFi protocol data including TVL, holders, and positions
 * - Token information: Comprehensive token details, prices, and holder data
 * - User portfolios: Detailed user positions, balances, and holdings across chains
 * - NFT data: User NFT collections and holdings
 * - Transaction history: Comprehensive transaction tracking and analysis
 * - Gas prices: Real-time gas price data for transaction optimization
 * - Transaction simulation: Pre-execution and explanation capabilities
 */
async function main() {
	const server = new FastMCP({
		name: "DeBank MCP Server",
		version: "1.0.0",
	});

	// Register all tools
	type RegisteredTool = Parameters<typeof server.addTool>[0];
	const registeredTools = debankTools as ReadonlyArray<RegisteredTool>;
	for (const tool of registeredTools) {
		server.addTool(tool);
	}

	try {
		await server.start({
			transportType: "stdio",
		});
	} catch (error) {
		logger.error("Failed to start server", error as Error);
		process.exit(1);
	}
}

main().catch((error) => {
	logger.error("Unexpected error occurred", error);
	process.exit(1);
});
