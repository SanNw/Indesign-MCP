import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const cases = [
  ["en", "Checks whether Adobe InDesign is open", /disabled/],
  ["pt-BR", "Verifica se o Adobe InDesign está aberto", /desabilitado/],
  ["es", "Comprueba si Adobe InDesign está abierto", /deshabilitado/],
  ["invalid", "Checks whether Adobe InDesign is open", /disabled/],
];

for (const [language, description, disabled] of cases) {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    env: { ...process.env, INDESIGN_MCP_LANGUAGE: language },
  });
  const client = new Client({ name: "mcp-indesign-test", version: "0.2.0" });

  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 19);
    assert.match(tools.find(({ name }) => name === "check_connection").description, new RegExp(description));

    const result = await client.callTool({ name: "run_jsx", arguments: { code: "1 + 1" } });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, disabled);
  } finally {
    await client.close();
  }
}

console.log("MCP smoke test: OK");
