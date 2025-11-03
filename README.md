# DeBank MCP: Model Context Protocol Server for DeBank

This project implements a Model Context Protocol (MCP) server to interact with the DeBank API. It allows MCP-compatible clients (like AI assistants, IDE extensions, or custom applications) to access comprehensive blockchain and DeFi data including chain information, protocol analytics, token data, user portfolios, NFT holdings, transaction history, gas prices, and transaction simulation capabilities.

This server is built using TypeScript and `fastmcp`.

## Features (MCP Tools)

The server exposes the following tools that MCP clients can utilize:

### Chain Data
* **`debank_get_supported_chain_list`**: Retrieve all blockchain chains supported by DeBank.
  * Returns chain details including IDs, names, logo URLs, native token IDs, wrapped token IDs, and pre-execution support status.
* **`debank_get_chain`**: Get detailed information about a specific blockchain chain.
  * Parameters: `id` (chain name or ID - auto-resolved)
  * Auto-resolution: 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'

### Protocol Data
* **`debank_get_all_protocols_of_supported_chains`**: List all DeFi protocols across specified or all chains.
  * Parameters: `chain_ids` (optional, comma-separated, auto-resolved)
  * Returns top 20 protocols by default with TVL data
* **`debank_get_protocol_information`**: Fetch detailed information about a specific DeFi protocol.
  * Parameters: `id` (protocol ID like 'uniswap', 'aave', 'bsc_pancakeswap')
* **`debank_get_top_holders_of_protocol`**: Retrieve top holders within a protocol.
  * Parameters: `id`, `start` (0-1000), `limit` (max 100)
* **`debank_get_pool_information`**: Get detailed information about a specific liquidity pool.
  * Parameters: `id` (pool/contract address), `chain_id` (auto-resolved)

### Token Data
* **`debank_get_token_information`**: Fetch comprehensive token details on a blockchain.
  * Parameters: `chain_id` (auto-resolved), `id` (token address or wrapped token keyword)
  * Wrapped token resolution: 'WETH', 'wrapped native', 'native token' auto-resolve
* **`debank_get_list_token_information`**: Retrieve information for multiple tokens at once.
  * Parameters: `chain_id` (auto-resolved), `ids` (comma-separated, up to 100 tokens)
* **`debank_get_top_holders_of_token`**: Fetch top holders of a specified token.
  * Parameters: `id` (token address or keyword), `chain_id`, `start` (0-10000), `limit` (max 100)
* **`debank_get_token_history_price`**: Get historical token price for a specific date.
  * Parameters: `id` (token address or keyword), `chain_id`, `date_at` (YYYY-MM-DD)

### User Portfolio & Holdings
* **`debank_get_user_used_chain_list`**: List blockchain chains a user has interacted with.
  * Parameters: `id` (wallet address)
* **`debank_get_user_chain_balance`**: Get user's balance on a specific chain.
  * Parameters: `chain_id` (auto-resolved), `id` (wallet address)
* **`debank_get_user_protocol`**: Get user's positions within a specific DeFi protocol.
  * Parameters: `protocol_id`, `id` (wallet address)
* **`debank_get_user_complex_protocol_list`**: Retrieve user's detailed portfolios on a chain.
  * Parameters: `chain_id` (auto-resolved), `id` (wallet address)
* **`debank_get_user_all_complex_protocol_list`**: Get user's portfolios across all chains.
  * Parameters: `id` (wallet address), `chain_ids` (optional, comma-separated, auto-resolved)
* **`debank_get_user_all_simple_protocol_list`**: Fetch user's protocol balances across all chains.
  * Parameters: `id` (wallet address), `chain_ids` (optional, auto-resolved)
* **`debank_get_user_total_balance`**: Get user's total net assets across all chains.
  * Parameters: `id` (wallet address)

### User Tokens
* **`debank_get_user_token_balance`**: Retrieve user's balance for a specific token.
  * Parameters: `chain_id` (auto-resolved), `id` (wallet address), `token_id` (auto-resolved)
* **`debank_get_user_token_list`**: List all tokens held by a user on a specific chain.
  * Parameters: `id` (wallet address), `chain_id` (auto-resolved), `is_all` (optional)
* **`debank_get_user_all_token_list`**: Get user's token balances across all chains.
  * Parameters: `id` (wallet address), `is_all` (optional)

### User NFTs
* **`debank_get_user_nft_list`**: Fetch NFTs owned by a user on a specific chain.
  * Parameters: `id` (wallet address), `chain_id` (auto-resolved), `is_all` (optional)
* **`debank_get_user_all_nft_list`**: Get user's NFT holdings across all chains.
  * Parameters: `id` (wallet address), `is_all` (optional), `chain_ids` (optional, auto-resolved)

### Transaction History
* **`debank_get_user_history_list`**: Fetch user's transaction history on a specific chain.
  * Parameters: `id` (wallet address), `chain_id` (auto-resolved), `token_id` (optional, auto-resolved), `start_time` (optional), `page_count` (max 20)
* **`debank_get_user_all_history_list`**: Get user's transaction history across all chains.
  * Parameters: `id` (wallet address), `start_time` (optional), `page_count` (max 20), `chain_ids` (optional, auto-resolved)

### Security & Authorizations
* **`debank_get_user_token_authorized_list`**: List tokens with spending approvals on a chain.
  * Parameters: `id` (wallet address), `chain_id` (auto-resolved)
* **`debank_get_user_nft_authorized_list`**: List NFTs with spending permissions on a chain.
  * Parameters: `id` (wallet address), `chain_id` (auto-resolved)

### Portfolio Analytics
* **`debank_get_user_chain_net_curve`**: Get user's 24-hour net asset value curve on a chain.
  * Parameters: `id` (wallet address), `chain_id` (auto-resolved)
* **`debank_get_user_total_net_curve`**: Get user's 24-hour net asset value curve across all chains.
  * Parameters: `id` (wallet address), `chain_ids` (optional, auto-resolved)

### Transaction Operations
* **`debank_get_gas_prices`**: Fetch current gas prices for different transaction speeds.
  * Parameters: `chain_id` (auto-resolved)
  * Returns slow, normal, and fast speeds with estimated confirmation times
* **`debank_pre_exec_transaction`**: Simulate transaction execution before submitting on-chain.
  * Parameters: `tx` (JSON string), `pending_tx_list` (optional JSON array)
  * Returns balance changes, gas estimates, and success status
* **`debank_explain_transaction`**: Decode and explain a transaction in human-readable terms.
  * Parameters: `tx` (JSON string)

## Prerequisites

* Node.js (v18 or newer recommended)
* pnpm (See <https://pnpm.io/installation>)

## Installation

There are a few ways to use `debank-mcp`:

**1. Using `pnpm dlx` (Recommended for most MCP client setups):**

   You can run the server directly using `pnpm dlx` without needing a global installation. This is often the easiest way to integrate with MCP clients. See the "Running the Server with an MCP Client" section for examples.
   (`pnpm dlx` is pnpm's equivalent of `npx`)

**2. Global Installation from npm (via pnpm):**

   Install the package globally to make the `mcp-debank` command available system-wide:

   ```bash
   pnpm add -g @iqai/mcp-debank
   ```

**3. Building from Source (for development or custom modifications):**

   1. **Clone the repository:**

      ```bash
      git clone https://github.com/IQAIcom/debank-mcp.git
      cd debank-mcp
      ```

   2. **Install dependencies:**

      ```bash
      pnpm install
      ```

   3. **Build the server:**
      This compiles the TypeScript code to JavaScript in the `dist` directory.

      ```bash
      pnpm run build
      ```

      The `prepare` script also runs `pnpm run build`, so dependencies are built upon installation if you clone and run `pnpm install`.

## Configuration (Environment Variables)

This MCP server can be configured with environment variables set by the MCP client that runs it. These are typically configured in the client's MCP server definition (e.g., in a `mcp.json` file for Cursor, or similar for other clients).

**All environment variables are optional**, but you may want to configure one of the following for API access:

### DeBank API Configuration (Choose One)

1. **Direct DeBank API Access** (Recommended for most users):
   * **`DEBANK_API_KEY`**: Your DeBank API key (get one at [https://debank.com](https://debank.com))
   * If not provided, the server will make unauthenticated requests to DeBank (subject to rate limits)

2. **IQ Gateway** (For advanced caching and monitoring):
   * **`IQ_GATEWAY_URL`**: Custom IQ Gateway URL for enhanced resolution capabilities
   * **`IQ_GATEWAY_KEY`**: API key for IQ Gateway access
   * This option is primarily for IQAI internal use but available for users with their own gateway infrastructure

### Enhanced Features (Optional)

* **`OPENROUTER_API_KEY`**: API key for OpenRouter LLM integration for enhanced entity resolution
* **`LLM_MODEL`**: LLM model to use for entity resolution (default: `openai/gpt-4.1-mini`)
* **`GOOGLE_GENERATIVE_AI_API_KEY`**: Google Generative AI API key for alternative LLM integration

## Running the Server with an MCP Client

MCP clients (like AI assistants, IDE extensions, etc.) will run this server as a background process. You need to configure the client to tell it how to start your server.

Below are example configuration snippets that an MCP client might use (e.g., in a `mcp_servers.json` or similar configuration file). These examples show how to run the server using the published npm package via `pnpm dlx`.

**Basic Configuration (Recommended for most users):**

```json
{
  "mcpServers": {
    "debank-mcp-server": {
      "command": "pnpm",
      "args": [
        "dlx",
        "@iqai/mcp-debank"
      ],
      "env": {
        "DEBANK_API_KEY": "your_debank_api_key_here"
      }
    }
  }
}
```

**Minimal Configuration (No API key - uses unauthenticated requests):**

```json
{
  "mcpServers": {
    "debank-mcp-server": {
      "command": "pnpm",
      "args": [
        "dlx",
        "@iqai/mcp-debank"
      ],
      "env": {}
    }
  }
}
```

**Advanced Configuration (With IQ Gateway):**

```json
{
  "mcpServers": {
    "debank-mcp-server": {
      "command": "pnpm",
      "args": [
        "dlx",
        "@iqai/mcp-debank"
      ],
      "env": {
        "IQ_GATEWAY_URL": "your_iq_gateway_url",
        "IQ_GATEWAY_KEY": "your_iq_gateway_key",
        "OPENROUTER_API_KEY": "your_openrouter_api_key_if_needed",
        "LLM_MODEL": "openai/gpt-4.1-mini",
        "GOOGLE_GENERATIVE_AI_API_KEY": "your_google_api_key_if_needed"
      }
    }
  }
}
```

**Alternative if Globally Installed:**

If you have installed `debank-mcp` globally (`pnpm add -g @iqai/mcp-debank`), you can simplify the `command` and `args`:

```json
{
  "mcpServers": {
    "debank-mcp-server": {
      "command": "mcp-debank",
      "args": [],
      "env": {
        "DEBANK_API_KEY": "your_debank_api_key_here"
      }
    }
  }
}
```

* **`command`**: The executable to run.
  * For `pnpm dlx`: `"pnpm"` (with `"dlx"` as the first arg)
  * For global install: `"mcp-debank"`
* **`args`**: An array of arguments to pass to the command.
  * For `pnpm dlx`: `["dlx", "@iqai/mcp-debank"]`
  * For global install: `[]`
* **`env`**: An object containing environment variables to be set when the server process starts. All environment variables are optional.

## Development

- `pnpm run watch` – compile on change
- `pnpm run format` – format with Biome
- `pnpm run lint` – lint with Biome
- `pnpm run build` – build the project

## Features

### Auto-Resolution
Many tools support automatic resolution of human-friendly names to API-compatible identifiers:
- **Chains**: Use names like 'Ethereum', 'BSC', 'Binance Smart Chain', 'Polygon', 'Arbitrum' directly
- **Wrapped Tokens**: Use keywords like 'WETH', 'wrapped native', 'native token' to automatically resolve to chain-specific wrapped token addresses
- **Multi-chain Support**: Pass comma-separated chain names like 'Ethereum, BSC, Polygon' which automatically resolve to 'eth,bsc,matic'

The server uses AI-powered entity resolution to match common variations and names to correct API identifiers.

### Comprehensive DeFi Data
- **Portfolio Tracking**: Complete visibility into user holdings across chains and protocols
- **Transaction History**: Detailed tracking of all DeFi activities
- **Security Auditing**: Review token and NFT spending approvals
- **Analytics**: 24-hour net asset value curves and portfolio performance tracking
- **Gas Optimization**: Real-time gas price data for different transaction speeds
- **Transaction Simulation**: Pre-execute transactions to preview outcomes before submitting on-chain

## Resources

- [DeBank API Documentation](https://docs.cloud.debank.com/)
- [FastMCP Documentation](https://github.com/punkpeye/fastmcp)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)
