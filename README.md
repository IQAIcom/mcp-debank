# 🏦 DeBank MCP Server

[![npm version](https://img.shields.io/npm/v/@iqai/mcp-debank.svg)](https://www.npmjs.com/package/@iqai/mcp-debank)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

## 📖 Overview

The DeBank MCP Server enables AI agents to interact with the [DeBank](https://debank.com) API for comprehensive blockchain and DeFi data access. This server provides tools to access chain information, protocol analytics, token data, user portfolios, NFT holdings, transaction history, gas prices, and transaction simulation capabilities.

By implementing the Model Context Protocol (MCP), this server allows Large Language Models (LLMs) to discover blockchain chains, analyze DeFi protocols, track user portfolios, and simulate transactions directly through their context window, bridging the gap between AI and decentralized finance data.

## ✨ Features

*   **Multi-Chain Support**: Access data from 100+ blockchain networks supported by DeBank with auto-resolution of chain names.
*   **Portfolio Tracking**: Monitor user positions, token balances, and protocol holdings across all chains.
*   **DeFi Analytics**: Analyze protocols, liquidity pools, and top holders with comprehensive TVL data.
*   **Transaction Tools**: Simulate transactions, check gas prices, and decode transaction data before on-chain submission.
*   **NFT Discovery**: Retrieve NFT holdings and spending permissions across multiple chains.
*   **Smart Resolution**: AI-powered entity resolution for chains, tokens, and wrapped token keywords.

## 📦 Installation

### 🚀 Using pnpm dlx (Recommended)

To use this server without installing it globally:

```bash
pnpm dlx @iqai/mcp-debank
```

### 🔧 Build from Source

```bash
git clone https://github.com/IQAIcom/mcp-debank.git
cd mcp-debank
pnpm install
pnpm run build
```

## ⚡ Running with an MCP Client

Add the following configuration to your MCP client settings (e.g., `claude_desktop_config.json`).

### 📋 Minimal Configuration

```json
{
  "mcpServers": {
    "debank": {
      "command": "pnpm",
      "args": ["dlx", "@iqai/mcp-debank"],
      "env": {
        "DEBANK_API_KEY": "your_debank_api_key_here"
      }
    }
  }
}
```

### ⚙️ Advanced Configuration (With IQ Gateway)

```json
{
  "mcpServers": {
    "debank": {
      "command": "pnpm",
      "args": ["dlx", "@iqai/mcp-debank"],
      "env": {
        "IQ_GATEWAY_URL": "your_iq_gateway_url",
        "IQ_GATEWAY_KEY": "your_iq_gateway_key",
        "OPENROUTER_API_KEY": "your_openrouter_api_key",
        "LLM_MODEL": "openai/gpt-4.1-mini"
      }
    }
  }
}
```

## 🔐 Configuration (Environment Variables)

| Variable | Required | Description | Default |
| :--- | :--- | :--- | :--- |
| `DEBANK_API_KEY` | No | Your DeBank API key for authenticated requests | - |
| `IQ_GATEWAY_URL` | No | Custom IQ Gateway URL for enhanced resolution | - |
| `IQ_GATEWAY_KEY` | No | API key for IQ Gateway access | - |
| `OPENROUTER_API_KEY` | No | OpenRouter API key for enhanced entity resolution | - |
| `LLM_MODEL` | No | LLM model for entity resolution | `openai/gpt-4.1-mini` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | No | Google Generative AI API key for alternative LLM | - |

## 💡 Usage Examples

### 🔗 Chain Data
*   "What blockchain chains does DeBank support?"
*   "Get information about the Ethereum chain."
*   "Show me details for BSC (Binance Smart Chain)."

### 📊 Protocol Analytics
*   "List all DeFi protocols on Ethereum."
*   "Get information about Uniswap protocol."
*   "Who are the top holders of Aave?"

### 💰 Token Data
*   "Get token information for WETH on Ethereum."
*   "What's the historical price of USDT on 2024-01-01?"
*   "Who are the top holders of this token?"

### 👛 Portfolio Tracking
*   "What's the total balance of wallet 0x123...?"
*   "Show me all tokens held by this address on Polygon."
*   "List all DeFi positions for this wallet."

### 🖼️ NFT Holdings
*   "What NFTs does this wallet own on Ethereum?"
*   "Show me NFT approvals for this address."

### ⛽ Transaction Tools
*   "What are the current gas prices on Ethereum?"
*   "Simulate this transaction before I submit it."
*   "Explain what this transaction does."

## 🛠️ MCP Tools

<!-- AUTO-GENERATED TOOLS START -->

### `debank_explain_transaction`
Decode and explain a given transaction in human-readable terms. Returns details about function calls, parameters, and actions derived from the transaction data. Supports complex transactions across multiple protocols.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tx` | string | ✅ | The transaction object as a JSON string to be explained. Must include transaction data field. |

### `debank_get_all_protocols_of_supported_chains`
Retrieve a list of all DeFi protocols across specified or all supported blockchain chains. Returns essential information about each protocol including ID, chain ID, name, logo URL, site URL, portfolio support status, and TVL. Returns top 20 protocols by default. Filter by specific chains using chain_ids parameter. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum, BSC, Polygon') - automatically resolved to chain IDs ('eth,bsc,matic').

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chain_ids` | string |  | Comma-separated chain names or IDs - auto-resolved (e.g., 'Ethereum, BSC'→'eth,bsc', 'Polygon'→'matic'). If omitted, returns protocols across all supported chains. Existing chain IDs like 'eth,bsc,matic' also work. |

### `debank_get_chain`
Retrieve detailed information about a specific blockchain chain supported by DeBank. Returns chain details including ID, name, logo URL, native token ID, wrapped token ID, and whether it supports pre-execution of transactions. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc').

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | ✅ | Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work. |

### `debank_get_gas_prices`
Fetch current gas prices for different transaction speed levels on a specified chain. Returns prices for slow, normal, and fast transaction speeds with estimated confirmation times. Crucial for transaction cost estimation. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc').

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chain_id` | string | ✅ | Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work. |

### `debank_get_list_token_information`
Retrieve detailed information for multiple tokens at once on a specific chain. Returns an array of token objects with comprehensive details. Useful for bulk token data retrieval, with support for up to 100 token addresses per request. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc').

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chain_id` | string | ✅ | Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work. |
| `ids` | string | ✅ | Comma-separated list of token addresses (up to 100). Example: '0xdac17f958d2ee523a2206206994597c13d831ec7,0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' |

### `debank_get_pool_information`
Retrieve detailed information about a specific liquidity pool. Returns pool details including ID, chain, protocol ID, contract IDs, name, USD value of deposited assets, total user count, and count of valuable users (>$100 USD value). Essential for analyzing specific pools for investment or research. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc').

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | ✅ | The unique identifier of the pool (typically a contract address, e.g., '0x00000000219ab540356cbb839cbe05303d7705fa'). |
| `chain_id` | string | ✅ | Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work. |

### `debank_get_protocol_information`
Fetch detailed information about a specific DeFi protocol. Returns protocol details including ID, associated chain, name, logo URL, site URL, portfolio support status, and total value locked (TVL). Useful for analyzing individual protocols across different chains.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | ✅ | The unique identifier of the protocol (e.g., 'bsc_pancakeswap' for PancakeSwap on BSC, 'uniswap', 'aave', 'curve'). Use debank_get_all_protocols_of_supported_chains to discover protocol IDs. |

### `debank_get_supported_chain_list`
Retrieve a comprehensive list of all blockchain chains supported by the DeBank API. Returns information about each chain including their IDs, names, logo URLs, native token IDs, wrapped token IDs, and pre-execution support status. Use this to discover available chains before calling other chain-specific endpoints.

_No parameters_

### `debank_get_token_history_price`
Retrieve the historical price of a specified token for a given date. Essential for financial analysis, historical comparison, and tracking price movements over time. Returns price data for the UTC time zone on the specified date. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc'). **WRAPPED TOKEN RESOLUTION:** Keywords like 'WETH', 'wrapped native', or 'native token' automatically resolve to the chain's wrapped token address.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | ✅ | Token contract address, native token ID, or wrapped token keyword. Auto-resolves: 'WETH'→WETH address, 'wrapped native'→chain's wrapped token, 'native token'→chain's wrapped token. Examples: 'WETH', 'wrapped MATIC', '0xdac17f958d2ee523a2206206994597c13d831ec7'. |
| `chain_id` | string | ✅ | Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work. |
| `date_at` | string | ✅ | The date for historical price data in UTC time zone. Format: YYYY-MM-DD (e.g., '2023-05-18'). |

### `debank_get_token_information`
Fetch comprehensive details about a specific token on a blockchain. Returns token information including contract address, chain, name, symbol, decimals, logo URL, associated protocol ID, USD price, verification status, and deployment timestamp. Essential for token analysis and display. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc'). **WRAPPED TOKEN RESOLUTION:** Keywords like 'WETH', 'wrapped native', or 'native token' automatically resolve to the chain's wrapped token address.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chain_id` | string | ✅ | Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work. |
| `id` | string | ✅ | Token contract address, native token ID, or wrapped token keyword. Auto-resolves: 'WETH'→WETH address, 'wrapped native'→chain's wrapped token, 'native token'→chain's wrapped token. Examples: 'WETH', 'wrapped ETH', 'native token', '0xdac17f958d2ee523a2206206994597c13d831ec7' (USDT). |

### `debank_get_top_holders_of_protocol`
Retrieve a list of top holders within a specified DeFi protocol, ranked by their holdings. Provides insights into the distribution and concentration of holdings among participants. Supports pagination for large result sets.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | ✅ | The unique identifier of the protocol (e.g., 'uniswap', 'aave', 'compound'). Use debank_get_all_protocols_of_supported_chains to find protocol IDs. |
| `start` | number |  | Pagination offset to specify where to start in the list. Default is 0, maximum is 1000. |
| `limit` | number |  | Maximum number of top holders to retrieve. Default and maximum is 100. |

### `debank_get_top_holders_of_token`
Fetch the top holders of a specified token, showing the largest token holders ranked by their holdings. Supports both contract addresses and native token IDs. Useful for analyzing token distribution and ownership concentration. Supports pagination for detailed analysis. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc'). **WRAPPED TOKEN RESOLUTION:** Keywords like 'WETH', 'wrapped native', or 'native token' automatically resolve to the chain's wrapped token address.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | ✅ | Token contract address, native token ID, or wrapped token keyword. Auto-resolves: 'WETH'→WETH address, 'wrapped native'→chain's wrapped token, 'native token'→chain's wrapped token. Examples: 'WETH', 'wrapped BNB', '0xdac17f958d2ee523a2206206994597c13d831ec7'. |
| `chain_id` | string | ✅ | Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work. |
| `start` | number |  | Pagination offset. Default is 0, maximum is 10000. |
| `limit` | number |  | Maximum number of holders to return. Default is 100. |

### `debank_get_user_all_complex_protocol_list`
Retrieve a user's detailed portfolios across all supported chains within multiple protocols. Provides a comprehensive overview of investments and positions across the entire DeFi ecosystem. Can be filtered by specific chains. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum, BSC, Polygon') - automatically resolved to chain IDs ('eth,bsc,matic').

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | ✅ | The user's wallet address. |
| `chain_ids` | string |  | Comma-separated chain names or IDs - auto-resolved (e.g., 'Ethereum, BSC'→'eth,bsc', 'Polygon'→'matic'). If omitted, includes all supported chains. Existing chain IDs like 'eth,bsc,matic' also work. |

### `debank_get_user_all_history_list`
Retrieve a user's transaction history across all supported chains. Provides a comprehensive overview of DeFi activities across the entire blockchain ecosystem. Supports pagination and chain filtering. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum, BSC, Polygon') - automatically resolved to chain IDs ('eth,bsc,matic').

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | ✅ | The user's wallet address. |
| `start_time` | number |  | Optional timestamp to return history earlier than this time. |
| `page_count` | number |  | Number of entries to return. Maximum is 20. |
| `chain_ids` | string |  | Comma-separated chain names or IDs - auto-resolved (e.g., 'Ethereum, BSC, Polygon'→'eth,bsc,matic', 'Arbitrum'→'arb'). If omitted, includes all supported chains. Existing chain IDs like 'eth,bsc,polygon' also work. |

### `debank_get_user_all_nft_list`
Retrieve a user's NFT holdings across all supported chains. Provides an aggregate list of NFTs held by the user with details including contract ID, name, and content type. Can be filtered by specific chains. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum, BSC, Polygon') - automatically resolved to chain IDs ('eth,bsc,matic').

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | ✅ | The user's wallet address. |
| `is_all` | boolean |  | If true, includes all NFTs. Default is true. |
| `chain_ids` | string |  | Comma-separated chain names or IDs - auto-resolved (e.g., 'Ethereum, BSC, Polygon'→'eth,bsc,matic', 'Arbitrum'→'arb'). If omitted, includes all supported chains. Existing chain IDs like 'eth,bsc,polygon' also work. |

### `debank_get_user_all_simple_protocol_list`
Fetch a user's balances in protocols across all supported chains. Returns simplified protocol information including TVL and basic details. Useful for getting a quick overview of a user's protocol engagements. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum, BSC, Polygon') - automatically resolved to chain IDs ('eth,bsc,matic').

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | ✅ | The user's wallet address. |
| `chain_ids` | string |  | Comma-separated chain names or IDs - auto-resolved (e.g., 'Ethereum, BSC, Polygon'→'eth,bsc,matic', 'Arbitrum'→'arb'). If omitted, includes all supported chains. Existing chain IDs like 'eth,bsc,polygon' also work. |

### `debank_get_user_all_token_list`
Retrieve a user's token balances across all supported chains. Provides a comprehensive list of all tokens held by the user, offering insights into their wider cryptocurrency portfolio.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | ✅ | The user's wallet address. |
| `is_all` | boolean |  | If true, includes all tokens in the response. Default is true. |

### `debank_get_user_chain_balance`
Fetch the current balance of a user's account on a specified blockchain chain. Returns the balance in USD value, providing a snapshot of the user's holdings on that chain. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc').

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chain_id` | string | ✅ | Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work. |
| `id` | string | ✅ | The user's wallet address. |

### `debank_get_user_chain_net_curve`
Retrieve a user's 24-hour net asset value curve on a single chain. Shows the changes in total USD value of assets over the last 24 hours, providing insights into portfolio fluctuations on that specific chain. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc').

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | ✅ | The user's wallet address. |
| `chain_id` | string | ✅ | Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work. |

### `debank_get_user_complex_protocol_list`
Retrieve detailed portfolios of a user on a specific chain across multiple protocols. Returns comprehensive information about the user's engagements including protocol details and portfolio items with assets, debts, and positions. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc').

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chain_id` | string | ✅ | Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work. |
| `id` | string | ✅ | The user's wallet address. |

### `debank_get_user_history_list`
Fetch a user's transaction history on a specified chain. Returns a list of past transactions with details including transaction type, tokens involved, values, and timestamps. Supports filtering by token and pagination. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc'). **WRAPPED TOKEN RESOLUTION:** Keywords like 'WETH', 'wrapped native', or 'native token' automatically resolve to the chain's wrapped token address.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | ✅ | The user's wallet address. |
| `chain_id` | string | ✅ | Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work. |
| `token_id` | string |  | Optional token contract address, native token ID, or wrapped token keyword to filter history. Auto-resolves: 'WETH'→WETH address, 'wrapped native'→chain's wrapped token, 'native token'→chain's wrapped token. |
| `start_time` | number |  | Optional timestamp to return history earlier than this time (Unix timestamp). |
| `page_count` | number |  | Number of entries to return. Maximum is 20. |

### `debank_get_user_nft_authorized_list`
Retrieve a list of NFTs for which a user has given spending permissions on a specified chain. Returns details including contract IDs, names, symbols, spender addresses, and approved amounts for ERC1155 tokens. Important for security reviews. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc').

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | ✅ | The user's wallet address. |
| `chain_id` | string | ✅ | Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work. |

### `debank_get_user_nft_list`
Fetch a list of NFTs owned by a user on a specific chain. Returns NFT details including contract ID, name, description, content type, and attributes. Can filter for verified collections only. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc').

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | ✅ | The user's wallet address. |
| `chain_id` | string | ✅ | Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work. |
| `is_all` | boolean |  | If false, only returns NFTs from verified collections. Default is true. |

### `debank_get_user_protocol`
Get detailed information about a user's positions within a specified DeFi protocol. Returns protocol details and the user's portfolio items including assets, debts, and rewards in that protocol.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `protocol_id` | string | ✅ | The protocol ID (e.g., 'bsc_pancakeswap', 'uniswap', 'aave')Use debank_get_all_protocols_of_supported_chains to discover protocol IDs.. |
| `id` | string | ✅ | The user's wallet address. |

### `debank_get_user_token_authorized_list`
Fetch a list of tokens for which a user has granted spending approvals on a specified chain. Returns details about each approval including amount, spender address, and associated protocol information. Useful for security audits. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc').

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | ✅ | The user's wallet address. |
| `chain_id` | string | ✅ | Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work. |

### `debank_get_user_token_balance`
Retrieve a user's balance for a specific token. Returns detailed token information including name, symbol, decimals, USD price, and the user's balance amount. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc'). **WRAPPED TOKEN RESOLUTION:** Keywords like 'WETH', 'wrapped native', or 'native token' automatically resolve to the chain's wrapped token address.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chain_id` | string | ✅ | Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work. |
| `id` | string | ✅ | The user's wallet address. |
| `token_id` | string | ✅ | Token contract address, native token ID, or wrapped token keyword. Auto-resolves: 'WETH'→WETH address, 'wrapped native'→chain's wrapped token, 'native token'→chain's wrapped token. Examples: 'WETH', 'wrapped token', '0xdac17f958d2ee523a2206206994597c13d831ec7'. |

### `debank_get_user_token_list`
Retrieve a list of tokens held by a user on a specific chain. Returns token details including symbol, decimals, USD price, and balance amounts. Can filter for core/verified tokens or include all tokens. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc').

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | ✅ | The user's wallet address. |
| `chain_id` | string | ✅ | Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work. |
| `is_all` | boolean |  | If true, returns all tokens including non-core tokens. Default is true. |

### `debank_get_user_total_balance`
Retrieve a user's total net assets across all supported chains. Calculates and returns the total USD value of assets including both tokens and protocol positions. Provides a complete snapshot of the user's DeFi portfolio.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | ✅ | The user's wallet address. |

### `debank_get_user_total_net_curve`
Retrieve a user's 24-hour net asset value curve across all chains. Provides a comprehensive view of total USD value changes over the last 24 hours, helping track overall portfolio performance. Can be filtered by specific chains. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum, BSC, Polygon') - automatically resolved to chain IDs ('eth,bsc,matic').

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | ✅ | The user's wallet address. |
| `chain_ids` | string |  | Comma-separated chain names or IDs - auto-resolved (e.g., 'Ethereum, BSC, Polygon'→'eth,bsc,matic', 'Arbitrum'→'arb'). If omitted, includes all supported chains. Existing chain IDs like 'eth,bsc,polygon' also work. |

### `debank_get_user_used_chain_list`
Retrieve a list of blockchain chains that a specific user has interacted with. Returns details about each chain including ID, name, logo URL, native token ID, wrapped token ID, and the birth time of the user's address on each chain.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | ✅ | The user's wallet address. |

### `debank_pre_exec_transaction`
Simulate the execution of a transaction or sequence of transactions before submitting them on-chain. Returns detailed information about balance changes, gas estimates, and success status. Useful for DEX swaps requiring token approvals or complex transaction sequences.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tx` | string | ✅ | The main transaction object as a JSON string. Must include fields like from, to, data, value, etc. |
| `pending_tx_list` | string |  | Optional JSON string array of transactions to execute before the main transaction (e.g., approval transactions). |

<!-- AUTO-GENERATED TOOLS END -->

## 👨‍💻 Development

### 🏗️ Build Project
```bash
pnpm run build
```

### 👁️ Development Mode (Watch)
```bash
pnpm run watch
```

### ✅ Linting & Formatting
```bash
pnpm run lint
pnpm run format
```

### 📁 Project Structure
*   `src/tools/`: Tool definitions
*   `src/services/`: API client and business logic
*   `src/lib/`: Shared utilities and entity resolution
*   `src/index.ts`: Server entry point

## 📚 Resources

*   [DeBank API Documentation](https://docs.cloud.debank.com/)
*   [Model Context Protocol (MCP)](https://modelcontextprotocol.io)
*   [DeBank Platform](https://debank.com)

## ⚠️ Disclaimer

This project is an unofficial tool and is not directly affiliated with DeBank. It interacts with blockchain and DeFi data. Users should exercise caution and verify all data independently. DeFi interactions involve risk.

## 📄 License

[ISC](LICENSE)
