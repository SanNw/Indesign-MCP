import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command: "node", args: ["dist/index.js"] });
const client = new Client({ name: "mcp-indesign-test", version: "0.1.0" });

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 19);
  assert(tools.some(({ name }) => name === "check_connection"));
  assert(tools.some(({ name }) => name === "run_jsx"));

  const result = await client.callTool({ name: "run_jsx", arguments: { code: "1 + 1" } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /desabilitado/);
} finally {
  await client.close();
}

console.log("MCP smoke test: OK");
