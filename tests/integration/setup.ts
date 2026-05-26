// tests/integration/setup.ts (loaded via vitest config setupFiles)
import { vi } from "vitest";

/**
 * 1. Neutralize dotenv BEFORE env.ts is imported. Default dotenv.config()
 *    populates keys that are undefined from a .env file — so a `delete`
 *    without this mock would silently re-introduce IQ_GATEWAY_* from a
 *    developer's local .env.
 */
vi.mock("dotenv", () => ({ config: () => ({ parsed: {} }) }));

/**
 * 2. Set the one required env var and delete the rest. Empty strings are
 *    NOT a valid alternative here: env.ts uses `z.url().optional()` and
 *    `z.string().min(1).optional()`, both of which REJECT empty strings and
 *    fail the parse. Only `undefined` resolves to the optional "unset"
 *    branch — which means `delete`, not stub-to-"".
 */
process.env.DEBANK_API_KEY = "test-key";
delete process.env.IQ_GATEWAY_URL;
delete process.env.IQ_GATEWAY_KEY;
