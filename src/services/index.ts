/**
 * DeBank Services
 * Exports singleton instances of all domain-specific services
 */

import { ChainService } from "./chain.service.js";
import { ProtocolService } from "./protocol.service.js";
import { TokenService } from "./token.service.js";
import { TransactionService } from "./transaction.service.js";
import { UserService } from "./user.service.js";

export { BaseService } from "./base.service.js";
export { ChainService } from "./chain.service.js";
export { ProtocolService } from "./protocol.service.js";
export { TokenService } from "./token.service.js";
export { TransactionService } from "./transaction.service.js";
export { UserService } from "./user.service.js";

// Create singleton instances
export const chainService = new ChainService();
export const protocolService = new ProtocolService();
export const tokenService = new TokenService();
export const transactionService = new TransactionService();
export const userService = new UserService();
