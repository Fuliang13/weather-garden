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


	it("imports and exports Garden KML through persisted KV GardenState", async () => {
		await env.WEATHER_KV.delete("garden_state");
		const request = new Request("http://example.com/api/garden/import-kml", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				fileName: "test.kml",
				kml: `<?xml version="1.0" encoding="UTF-8"?>
				<kml xmlns="http://www.opengis.net/kml/2.2">
				  <Document>
				    <name>Test Garden</name>
				    <Placemark id="potager">
				      <name>Potager</name>
				      <Polygon>
				        <outerBoundaryIs><LinearRing><coordinates>-1.103,48.476,0 -1.102,48.476,0 -1.102,48.475,0 -1.103,48.476,0</coordinates></LinearRing></outerBoundaryIs>
				      </Polygon>
				    </Placemark>
				  </Document>
				</kml>`
			})
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		const body = await response.json();

		expect(response.ok).toBe(true);
		expect(body.ok).toBe(true);
		expect(body.garden.entities).toHaveLength(1);
		expect(body.garden.imports[0]).toMatchObject({
			type: "kml",
			fileName: "test.kml",
			mode: "replace",
			entityCount: 1
		});

		const stored = await worker.fetch(new Request("http://example.com/api/garden"), env, createExecutionContext());
		const storedBody = await stored.json();
		expect(storedBody.entities[0]).toMatchObject({
			id: "potager",
			position: { geometry: { type: "Polygon" } }
		});

		const exportResponse = await worker.fetch(new Request("http://example.com/api/garden/export-kml"), env, createExecutionContext());
		const kml = await exportResponse.text();
		expect(exportResponse.ok).toBe(true);
		expect(exportResponse.headers.get("content-type")).toContain("application/vnd.google-earth.kml+xml");
		expect(kml).toContain("<name>Potager</name>");
	});

	it("returns a default GardenState without overwriting corrupt KV JSON", async () => {
		await env.WEATHER_KV.put("garden_state", "{bad json");
		const response = await worker.fetch(new Request("http://example.com/api/garden"), env, createExecutionContext());
		const body = await response.json();
		const stored = await env.WEATHER_KV.get("garden_state");

		expect(response.ok).toBe(true);
		expect(body.entities.some((entity) => entity.id === "vigne")).toBe(true);
		expect(body.metadata.recovery).toMatchObject({
			key: "garden_state",
			reason: "corrupt_json"
		});
		expect(stored).toBe("{bad json");
	});

	it("returns public settings in integration mode", async () => {
		const response = await SELF.fetch("http://example.com/api/settings");
		const body = await response.json();

		expect(response.ok).toBe(true);
		expect(typeof body.enableRainAlerts).toBe("boolean");
	});
});
