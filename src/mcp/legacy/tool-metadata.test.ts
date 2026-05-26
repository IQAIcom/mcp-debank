import { describe, expect, it } from "vitest";
import { TOOL_METADATA } from "./tool-metadata.js";

describe("tool-metadata in-process checks", () => {
	it("contains exactly 31 entries", () => {
		expect(TOOL_METADATA).toHaveLength(31);
	});

	it("every entry has all required fields", () => {
		for (const m of TOOL_METADATA) {
			expect(m.name).toMatch(/^debank_/);
			expect(m.qualified).toMatch(/^debank\./);
			expect(typeof m.legacyImpl).toBe("function");
			expect(typeof m.sandboxImpl).toBe("function");
			expect(m.description.length).toBeGreaterThan(20);
			expect(m.exampleCall.length).toBeGreaterThan(10);
		}
	});

	it("strips _userQuery from parameters", () => {
		for (const m of TOOL_METADATA) {
			const shape = (
				m.parameters as unknown as { shape?: Record<string, unknown> }
			).shape;
			if (shape) expect(shape).not.toHaveProperty("_userQuery");
		}
	});
});
