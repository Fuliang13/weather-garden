import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
	SELF,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/worker.js";

describe("Weather Garden worker", () => {
	it("returns public settings without private ntfy topic", async () => {
		const request = new Request("http://example.com/api/settings");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		const body = await response.json();

		expect(response.ok).toBe(true);
		expect(body.rainThresholdMm).toBeGreaterThan(0);
		expect(body).not.toHaveProperty("ntfyTopic");
	});

	it("returns the default garden state without calling weather providers", async () => {
		const request = new Request("http://example.com/api/garden");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		const body = await response.json();

		expect(response.ok).toBe(true);
		expect(body.entities.some((entity) => entity.id === "vigne" && entity.type === "vine")).toBe(true);
	});

	it("returns public settings in integration mode", async () => {
		const response = await SELF.fetch("http://example.com/api/settings");
		const body = await response.json();

		expect(response.ok).toBe(true);
		expect(typeof body.enableRainAlerts).toBe("boolean");
	});
});
