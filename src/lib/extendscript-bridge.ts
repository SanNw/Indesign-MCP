import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ScriptResult, InDesignEnv } from "./types.js";
import { t } from "../i18n.js";

const execFileAsync = promisify(execFile);
const SCRIPT_LANGUAGE_JAVASCRIPT = 1246973031;

export const defaultEnv: InDesignEnv = {
  timeoutMs: 30000,
};

export async function checkInDesignConnection(env: InDesignEnv): Promise<boolean> {
  return (await executeScript(env, "String(app.version);")).success;
}

export async function executeScript(
  env: InDesignEnv,
  code: string
): Promise<ScriptResult> {
  const wrapped = `(function () {
    function json(value) {
      if (value === null || value === undefined) return "null";
      if (typeof value === "string") {
        var quoted = '"', slash = String.fromCharCode(92), charCode;
        for (var c = 0; c < value.length; c++) {
          charCode = value.charCodeAt(c);
          if (charCode === 34) quoted += slash + '"';
          else if (charCode === 92) quoted += slash + slash;
          else if (charCode === 13) quoted += slash + "r";
          else if (charCode === 10) quoted += slash + "n";
          else if (charCode === 9) quoted += slash + "t";
          else if (charCode < 32) quoted += slash + "u" + ("000" + charCode.toString(16)).slice(-4);
          else quoted += value.charAt(c);
        }
        return quoted + '"';
      }
      if (typeof value === "number" || typeof value === "boolean") return String(value);
      var parts = [], i, key;
      if (value instanceof Array) {
        for (i = 0; i < value.length; i++) parts.push(json(value[i]));
        return "[" + parts.join(",") + "]";
      }
      for (key in value) if (value.hasOwnProperty(key)) parts.push(json(key) + ":" + json(value[key]));
      return "{" + parts.join(",") + "}";
    }
    try {
      var data = eval(${JSON.stringify(code)});
      return json({ success: true, data: data === undefined ? null : data });
    } catch (e) {
      return json({ success: false, error: String(e), exitCode: 1 });
    }
  })();`;
  const encoded = Buffer.from(wrapped, "utf8").toString("base64");
  const command = `
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$code = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:MCP_INDESIGN_SCRIPT))
$type = [Type]::GetTypeFromProgID('InDesign.Application')
if ($null -eq $type) { throw ${JSON.stringify(t("comNotRegistered"))} }
$app = [Activator]::CreateInstance($type)
try { $app.DoScript($code, ${SCRIPT_LANGUAGE_JAVASCRIPT}, @()) }
finally { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($app) | Out-Null }
`;

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", command],
      {
        timeout: env.timeoutMs,
        windowsHide: true,
        env: { ...process.env, MCP_INDESIGN_SCRIPT: encoded },
      }
    );
    return JSON.parse(stdout.trim()) as ScriptResult;
  } catch (error) {
    return { success: false, error: String(error), exitCode: -1 };
  }
}
