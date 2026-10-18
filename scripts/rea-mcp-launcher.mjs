import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Entry point for the Claude Code plugin MCP server. A development checkout
// runs the local build; an npm-sourced plugin install ships without its
// dependencies, so fall back to the published package pinned to the version
// this plugin ships with.
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hasLocalRuntime =
  existsSync(join(packageRoot, "scripts/rea.mjs")) &&
  existsSync(join(packageRoot, "dist/identity.js")) &&
  existsSync(join(packageRoot, "node_modules"));
const { default: packageJson } = await import("../package.json", {
  with: { type: "json" },
});

const child = hasLocalRuntime
  ? spawn(process.execPath, [join(packageRoot, "scripts/rea.mjs"), "mcp"], {
      stdio: "inherit",
    })
  : spawn("npx", ["-y", `${packageJson.name}@${packageJson.version}`, "mcp"], {
      stdio: "inherit",
      // Windows resolves `npx` through `npx.cmd`, which spawn only finds via a shell.
      shell: process.platform === "win32",
    });

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}
child.on("error", (error) => {
  console.error(`rea-mcp-launcher: ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exit(code ?? 1);
});
