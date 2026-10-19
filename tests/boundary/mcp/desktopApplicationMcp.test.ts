import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createServer } from "../../../src/server/createServer.js";
import { createTestBinarySession } from "../../fixtures/binarySession.js";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";
import { advertisedMcpToolSchemas } from "../../fixtures/advertisedMcpTool.js";
import { parseEvidence } from "../../../src/domain/evidence.js";
import { desktopApplicationSchema } from "../../../src/domain/desktopApplication.js";
import { analysisViewResultSchema } from "../../../src/domain/analysisView/analysisView.js";

it("advertises exact schemas and retains a compact directory answer with typed selected pages", async () => {
  const root = await createTestTempDirectory("rea-desktop-mcp-");
  await mkdir(join(root, "resources"));
  await writeFile(join(root, "resources/app.asar"), "path marker only");
  const session = createTestBinarySession(() => {
    throw new Error("Directory inspection must not acquire a deep provider");
  });
  const server = createServer({ kind: "session", session });
  const client = new Client({ name: "desktop-directory-test", version: "1" });
  onTestFinished(async () => {
    await client.close();
    await server.close();
    await session.close();
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const schemas = await advertisedMcpToolSchemas(
    client,
    "inspect_desktop_application",
  );
  const views = await advertisedMcpToolSchemas(client, "inspect_analysis_view");
  expect(schemas.ajv.validate(schemas.inputSchema, { path: root })).toBe(true);
  expect(
    schemas.ajv.validate(schemas.inputSchema, { path: root, execute: true }),
  ).toBe(false);
  const result = await client.callTool({
    name: "inspect_desktop_application",
    arguments: { path: root },
  });
  expect(result.isError).not.toBe(true);
  expect(
    schemas.ajv.validate(schemas.outputSchema, result.structuredContent),
    JSON.stringify(schemas.ajv.errors),
  ).toBe(true);
  const summary = parseEvidence(result.structuredContent);
  const view = analysisViewResultSchema.parse(summary.normalized_result);
  expect(view.kind).toBe("summary");
  const retained = session.evidenceById(view.parent_evidence_id);
  expect(retained).toBeDefined();
  const full = desktopApplicationSchema.parse(retained?.normalized_result);
  expect(full.candidates.map((candidate) => candidate.family)).toEqual([
    "electron",
  ]);
  const selected = await client.callTool({
    name: "inspect_analysis_view",
    arguments: {
      source: {
        kind: "retained-evidence",
        evidence_id: view.parent_evidence_id,
      },
      view: {
        kind: "desktop-application",
        collection: "files",
        paths: ["resources/app.asar"],
        fields: ["path", "read_status"],
        limit: 1,
      },
    },
  });
  expect(selected.isError).not.toBe(true);
  expect(
    views.ajv.validate(views.outputSchema, selected.structuredContent),
    JSON.stringify(views.ajv.errors),
  ).toBe(true);
  const page = parseEvidence(selected.structuredContent);
  expect(page.evidence_links).toEqual([view.parent_evidence_id]);
  expect(page.normalized_result).toMatchObject({
    items: [
      {
        file_id: expect.any(String),
        path: "resources/app.asar",
        read_status: "not-selected",
      },
    ],
    source_coverage: { status: "complete-within-scan" },
    coverage: { total: 1, exhausted: true },
  });
  const complete = await client.callTool({
    name: "inspect_desktop_application",
    arguments: { path: root, detail: "complete" },
  });
  expect(complete.isError).not.toBe(true);
  expect(parseEvidence(complete.structuredContent).evidence_id).toBe(
    view.parent_evidence_id,
  );
});
