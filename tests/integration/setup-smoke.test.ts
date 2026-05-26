import { describe, expect, it } from "vitest";

describe("setup", () => {
	it("set DEBANK_API_KEY and deleted others", () => {
		expect(process.env.DEBANK_API_KEY).toBe("test-key");
		expect(process.env.IQ_GATEWAY_URL).toBeUndefined();
		expect(process.env.IQ_GATEWAY_KEY).toBeUndefined();
	});
});
