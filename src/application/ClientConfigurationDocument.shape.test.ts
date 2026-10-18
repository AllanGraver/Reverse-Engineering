import { describe, expect, it } from "vitest";

import { parseClientConfiguration } from "./ClientConfigurationDocument.js";
import { supportedClients } from "./SupportedClients.js";

describe("parseClientConfiguration shape diagnostics", () => {
  it.each([
    ["null", "null"],
    ["array", "[]"],
    ["string", '"x"'],
  ] as const)("names a non-object JSON root (%s)", (_label, text) => {
    expect(() => parseClientConfiguration(text, "json")).toThrow(
      new TypeError("The configuration root must be an object"),
    );
  });

  it.each([
    ["null", "null"],
    ["array", "[]"],
    ["string", '"x"'],
  ] as const)(
    'names a non-object "mcpServers" value (%s)',
    (_label, servers) => {
      expect(() =>
        parseClientConfiguration(`{"mcpServers":${servers},"keep":1}`, "json"),
      ).toThrow(new TypeError('"mcpServers" must be an object'));
    },
  );

  it("still rejects unparsable JSON with SyntaxError", () => {
    expect(() => parseClientConfiguration("not-json", "json")).toThrow(
      SyntaxError,
    );
  });
});

describe("Gemini CLI settings syntax", () => {
  const format = supportedClients("/home/user", "linux", {}).find(
    ({ name }) => name === "gemini_cli",
  )?.format;

  it("accepts comments, which Gemini CLI strips before parsing", () => {
    expect(
      parseClientConfiguration('{\n  // keep\n  "mcpServers": {}\n}', format)
        .document,
    ).toEqual({ mcpServers: {} });
  });

  it.each([
    ["a trailing comma", '{"mcpServers": {},}'],
    ["a UTF-8 BOM", '﻿{"mcpServers": {}}'],
  ] as const)("rejects %s, which Gemini CLI cannot load", (_label, text) => {
    expect(() => parseClientConfiguration(text, format)).toThrow(SyntaxError);
  });
});
