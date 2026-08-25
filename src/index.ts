#!/usr/bin/env node
/**
 * MCP Server for Adobe InDesign
 *
 * Permite que o Claude controle o Adobe InDesign via ExtendScript bridge.
 * Funciona no Windows por meio da automação COM do InDesign.
 *
 * Instalação: veja README.md
 * Uso: configure em Claude Code (.mcp.json) ou Claude Desktop.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { defaultEnv, executeScript, checkInDesignConnection } from "./lib/extendscript-bridge.js";
import type { ScriptResult } from "./lib/types.js";
import { language, t } from "./i18n.js";

const jsxString = (value: string) => JSON.stringify(value);

// ========================================================================
// INICIALIZAÇÃO DO SERVER
// ========================================================================

const server = new McpServer({
  name: "indesign-mcp",
  version: "0.1.0",
  description: t("serverDescription"),
});

// ========================================================================
// HELPERS INTERNOS
// ========================================================================

/**
 * Executa código ExtendScript e formata o resultado para o MCP.
 */
async function runExtendScript(code: string): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    const result: ScriptResult = await executeScript(defaultEnv, code);

    if (!result.success) {
      return {
        content: [
          {
            type: "text",
            text: t("executeError") + result.error,
          },
        ],
        isError: true,
      };
    }

    const text = result.data !== undefined && result.data !== null
      ? `✅ ${t("success")}\n\n${JSON.stringify(result.data, null, 2)}`
      : `✅ ${t("completed")}`;

    return {
      content: [{ type: "text", text }],
    };
  } catch (e) {
    return {
      content: [
        {
          type: "text",
          text: `❌ ${t("internalError")}${String(e)}`,
        },
      ],
      isError: true,
    };
  }
}

// ========================================================================
// TOOL 1: Verificar conexão com InDesign
// ========================================================================

server.tool(
  "check_connection",
  t("check_connection"),
  {},
  async () => {
    const connected = await checkInDesignConnection(defaultEnv);
    if (connected) {
      return {
        content: [
          {
            type: "text",
            text: `✅ ${t("connected")}`,
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: `⚠️ ${t("notConnected", { timeout: defaultEnv.timeoutMs })}`,
        },
      ],
      isError: true,
    };
  }
);

// ========================================================================
// TOOL 2: Listar documentos abertos
// ========================================================================

server.tool(
  "list_documents",
  t("list_documents"),
  {},
  async () => {
    const code = `
var docs = [];
for (var i = 0; i < app.documents.length; i++) {
  var d = app.documents[i];
  docs.push({
    name: d.name,
    fullName: d.saved ? d.fullName.fsName : "",
    path: d.saved ? d.filePath.fsName : "",
    modified: d.modified,
    pageCount: d.pages.length,
    id: String(d.id)
  });
}
docs;`;

    return runExtendScript(code);
  }
);

// ========================================================================
// TOOL 3: Informações do documento
// ========================================================================

server.tool(
  "get_document_info",
  t("get_document_info"),
  {
    document: z.string().describe(t("document")),
  },
  async ({ document }) => {
    const code = `
var doc;
if (${document === "active" ? "true" : "false"}) {
  if (app.documents.length === 0) { throw new Error(${jsxString(t("noDocument"))}); }
  doc = app.documents[0];
} else {
  var targetName = ${jsxString(document)};
  doc = null;
  for (var i = 0; i < app.documents.length; i++) {
    if (app.documents[i].name === targetName) { doc = app.documents[i]; break; }
  }
  if (!doc) { throw new Error(${jsxString(t("documentNotFound"))} + ": " + targetName); }
}

var pages = [];
for (var i = 0; i < doc.pages.length; i++) {
  pages.push({ index: i + 1, name: doc.pages[i].name });
}

var info = {
  name: doc.name,
  fullName: doc.saved ? doc.fullName.fsName : "",
  path: doc.saved ? doc.filePath.fsName : "",
  modified: doc.modified,
  pageCount: doc.pages.length,
  documentPreferences: {
    pageWidth: doc.documentPreferences.pageWidth,
    pageHeight: doc.documentPreferences.pageHeight,
    facingPages: doc.documentPreferences.facingPages,
    pageOrientation: doc.documentPreferences.pageOrientation.toString()
  },
  pages: pages
};
info;`;

    return runExtendScript(code);
  }
);

// ========================================================================
// TOOL 4: Exportar como PDF
// ========================================================================

server.tool(
  "export_pdf",
  t("export_pdf"),
  {
    outputDir: z.string().describe(t("outputPdf")),
    document: z.string().optional().describe(t("documentScope")),
    pdfPreset: z.string().optional().describe(t("pdfPreset")),
    pageRange: z.string().optional().describe(t("pageRange")),
    overwrite: z.boolean().optional().describe(t("overwrite")),
  },
  async ({ outputDir, document = "active", pdfPreset = "[High Quality Print]", pageRange, overwrite = false }) => {
    const code = `
var outputDir = ${jsxString(outputDir)};
var docName = ${jsxString(document)};
var presetName = ${jsxString(pdfPreset)};
var range = ${pageRange ? jsxString(pageRange) : "null"};
var overwrite = ${overwrite};

function exportDoc(doc) {
  var name = doc.name.replace(/\\.indd$/i, "");
  var outFile = new File(outputDir + "/" + name + ".pdf");

  if (outFile.exists && !overwrite) {
    return { skipped: true, file: name + ".pdf", reason: ${jsxString(t("alreadyExists"))} };
  }

  var preset = app.pdfExportPresets.itemByName(presetName);
  if (!preset.isValid) { preset = app.pdfExportPresets.item(0); }

  var opts = {};
  if (range) { opts.pageString = range; }

  doc.exportFile(ExportFormat.PDF_TYPE, outFile, false, preset, undefined, opts);
  outFile = null;

  return { exported: true, file: name + ".pdf", preset: preset.name };
}

var results = [];
if (docName === "active") {
  if (app.documents.length === 0) throw new Error(${jsxString(t("noDocument"))});
  results.push(exportDoc(app.documents[0]));
} else if (docName === "all") {
  for (var i = 0; i < app.documents.length; i++) {
    results.push(exportDoc(app.documents[i]));
  }
} else {
  var found = false;
  for (var i = 0; i < app.documents.length; i++) {
    if (app.documents[i].name === docName) {
      results.push(exportDoc(app.documents[i]));
      found = true; break;
    }
  }
  if (!found) throw new Error(${jsxString(t("documentNotFound"))} + ": " + docName);
}
results;`;

    return runExtendScript(code);
  }
);

// ========================================================================
// TOOL 5: Exportar como imagem (JPG/PNG/TIFF)
// ========================================================================

server.tool(
  "export_image",
  t("export_image"),
  {
    outputDir: z.string().describe(t("outputDir")),
    format: z.enum(["JPG", "PNG", "TIFF"]).describe(t("imageFormat")),
    document: z.string().optional().describe(t("shortDocumentScope")),
    pageRange: z.string().optional().describe(t("imagePageRange")),
    resolution: z.number().int().min(72).max(1200).optional().describe(t("resolution")),
    quality: z.number().int().min(1).max(4).optional().describe(t("quality")),
    overwrite: z.boolean().optional().describe(t("overwrite")),
  },
  async ({ outputDir, format, document = "active", pageRange, resolution = 300, quality = 3, overwrite = false }) => {
    const fmtConst = format === "JPG" ? "JPG" : format === "PNG" ? "PNG" : "TIFF";
    const fmtLower = format.toLowerCase();

    const code = `
var outputDir = ${jsxString(outputDir)};
var fmt = "${fmtConst}";
var ext = "${fmtLower}";
var docName = ${jsxString(document)};
var range = ${pageRange ? jsxString(pageRange) : "null"};
var res = ${resolution};
var qual = ${quality};
var overwrite = ${overwrite};

function getPagesToExport(doc) {
  if (!range) {
    var all = [];
    for (var i = 0; i < doc.pages.length; i++) all.push(doc.pages[i]);
    return all;
  }
  var parts = range.split(",");
  var result = [];
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i].trim();
    if (part.indexOf("-") > -1) {
      var b = part.split("-");
      var s = parseInt(b[0]), e = parseInt(b[1]);
      for (var p = s; p <= e; p++) {
        if (p >= 1 && p <= doc.pages.length) result.push(doc.pages[p - 1]);
      }
    } else {
      var n = parseInt(part);
      if (n >= 1 && n <= doc.pages.length) result.push(doc.pages[n - 1]);
    }
  }
  return result;
}

function exportPage(doc, page, idx) {
  var docName = doc.name.replace(/\\.indd$/i, "");
  var outFile = new File(outputDir + "/" + docName + "_" + idx + "." + ext);
  if (outFile.exists && !overwrite) return { skipped: true, file: outFile.name };

  if (fmt === "JPG") {
    app.jpegExportPreferences.exportResolution = res;
    app.jpegExportPreferences.jpegQuality = qual;
    app.jpegExportPreferences.antiAliasing = true;
    app.jpegExportPreferences.embedColorProfile = true;
  } else if (fmt === "PNG") {
    app.pngExportPreferences.exportResolution = res;
    app.pngExportPreferences.antiAliasing = true;
    app.pngExportPreferences.transparentBackground = true;
  } else if (fmt === "TIFF") {
    app.tiffExportPreferences.exportResolution = res;
    app.tiffExportPreferences.byteOrder = TIFFByteOrder.INTEL;
    app.tiffExportPreferences.compression = CompressionType.NONE;
  }

  doc.exportFile(ExportFormat[fmt], outFile, false);
  outFile = null;
  return { exported: true, file: docName + "_" + idx + "." + ext };
}

var results = [];
var docs = [];
if (docName === "active") {
  if (app.documents.length === 0) throw new Error(${jsxString(t("noDocument"))});
    docs.push(app.documents[0]);
} else if (docName === "all") {
  for (var i = 0; i < app.documents.length; i++) docs.push(app.documents[i]);
} else {
  for (var i = 0; i < app.documents.length; i++) {
    if (app.documents[i].name === docName) { docs.push(app.documents[i]); break; }
  }
  if (docs.length === 0) throw new Error(${jsxString(t("documentNotFound"))} + ": " + docName);
}

for (var d = 0; d < docs.length; d++) {
  var pages = getPagesToExport(docs[d]);
  for (var p = 0; p < pages.length; p++) {
    results.push(exportPage(docs[d], pages[p], p + 1));
  }
}
results;`;

    return runExtendScript(code);
  }
);

// ========================================================================
// TOOL 6: Exportação em lote (usa BatchExportProfessional.jsx)
// ========================================================================

server.tool(
  "batch_export",
  t("batch_export"),
  {
    outputDir: z.string().describe(t("outputDir")),
    formats: z.array(z.enum(["pdf", "jpg", "png", "tiff", "eps", "epub", "idml", "html"])).describe(t("formats")),
    document: z.enum(["active", "all"]).describe(t("activeAllScope")),
    pageRange: z.string().optional().describe(t("imagePageRange")),
    pdfPreset: z.string().optional().describe(t("pdfPreset")),
    jpgQuality: z.number().int().min(1).max(4).optional().describe(t("jpgQuality")),
    resolution: z.number().int().min(72).max(1200).optional().describe(t("imageResolution")),
    overwrite: z.boolean().optional().describe(t("overwrite")),
    enableLogging: z.boolean().optional().describe(t("enableLogging")),
    openAfter: z.boolean().optional().describe(t("openAfter")),
    useBatchScript: z.boolean().optional().describe(t("useBatchScript")),
  },
  async ({
    outputDir,
    formats,
    document = "all",
    pageRange,
    pdfPreset = "[High Quality Print]",
    jpgQuality = 3,
    resolution = 300,
    overwrite = false,
    enableLogging = false,
    openAfter = false,
    useBatchScript = false,
  }) => {
    // Se usar o script batch existente, gera um wrapper que o invoca
    if (useBatchScript) {
      const batchScriptPath = process.env.INDESIGN_MCP_BATCH_SCRIPT;
      if (!batchScriptPath) {
        return {
          content: [{ type: "text", text: t("batchEnvMissing") }],
          isError: true,
        };
      }
      // Normaliza caminho para ExtendScript (usa /)
      const batchJsx = batchScriptPath.replace(/\\/g, "/");

      const code = `
// Wrapper para invocar BatchExportProfessional.jsx
var batchPath = new File(${jsxString(batchJsx)});
if (!batchPath.exists) throw new Error(${jsxString(t("batchNotFound"))} + batchPath.fsName);

// Configura variáveis globais esperadas pelo script
var config = {
  exportPDF: ${formats.includes("pdf")},
  exportJPG: ${formats.includes("jpg")},
  exportPNG: ${formats.includes("png")},
  exportTIFF: ${formats.includes("tiff")},
  exportEPS: ${formats.includes("eps")},
  exportEPUB: ${formats.includes("epub")},
  exportIDML: ${formats.includes("idml")},
  exportHTML: ${formats.includes("html")},
  pdfPreset: ${jsxString(pdfPreset)},
  jpgQuality: ${jpgQuality},
  jpgResolution: ${resolution},
  pngResolution: ${resolution},
  tiffResolution: ${resolution},
  pageRange: ${pageRange ? jsxString(pageRange) : "null"},
  usePageRange: ${pageRange ? "true" : "false"},
  exportAllPages: ${pageRange ? "false" : "true"},
  docScope: ${jsxString(document)},
  lastFolder: ${jsxString(outputDir)},
  overwriteExisting: ${overwrite},
  openAfterExport: ${openAfter},
  enableLogging: ${enableLogging},
  showAlerts: false
};

// Executa o script batch via app.doScript
app.doScript(batchPath, undefined, undefined, UndefinedConstant.UNDEFINED, false);

// O script batch salva resultados via app.storeLabel, lemos aqui
var result = app.extractLabel("batchExportResult") || ${jsxString(t("batchDone"))};
result;`;

      return runExtendScript(code);
    }

    // Caso contrário, gera ExtendScript dinâmico
    const fmtMap = {
      pdf: "PDF_TYPE",
      jpg: "JPG",
      png: "PNG",
      tiff: "TIFF",
      eps: "EPS",
      epub: "EPUB",
      idml: "INDESIGN_MARKUP",
      html: "HTML",
    };

    const code = `
var outputDir = ${jsxString(outputDir)};
var docScope = ${jsxString(document)};
var range = ${pageRange ? jsxString(pageRange) : "null"};
var preset = ${jsxString(pdfPreset)};
var jpgQual = ${jpgQuality};
var res = ${resolution};
var overwrite = ${overwrite};

function getDocs() {
  var docs = [];
  if (docScope === "active") {
  if (app.documents.length > 0) docs.push(app.documents[0]);
  } else {
    for (var i = 0; i < app.documents.length; i++) docs.push(app.documents[i]);
  }
  return docs;
}

function getPages(doc) {
  if (!range) {
    var all = [];
    for (var i = 0; i < doc.pages.length; i++) all.push({ page: doc.pages[i], num: i + 1 });
    return all;
  }
  var parts = range.split(",");
  var result = [];
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i].trim();
    if (part.indexOf("-") > -1) {
      var b = part.split("-");
      var s = parseInt(b[0]), e = parseInt(b[1]);
      for (var p = s; p <= e; p++) {
        if (p >= 1 && p <= doc.pages.length) result.push({ page: doc.pages[p - 1], num: p });
      }
    } else {
      var n = parseInt(part);
      if (n >= 1 && n <= doc.pages.length) result.push({ page: doc.pages[n - 1], num: n });
    }
  }
  return result;
}

var formats = ${JSON.stringify(formats)};
var results = [];
var docs = getDocs();

if (docs.length === 0) throw new Error(${jsxString(t("noDocumentExport"))});

for (var d = 0; d < docs.length; d++) {
  var doc = docs[d];
  var baseName = doc.name.replace(/\\.indd$/i, "");

  // Formatos de documento único
  if (formats.indexOf("pdf") >= 0) {
    var f = new File(outputDir + "/" + baseName + ".pdf");
    if (!f.exists || overwrite) {
      var p = app.pdfExportPresets.itemByName(preset);
      if (!p.isValid) p = app.pdfExportPresets.item(0);
      doc.exportFile(ExportFormat.PDF_TYPE, f, false, p);
      results.push({ doc: baseName, format: "pdf", status: "ok" });
    } else { results.push({ doc: baseName, format: "pdf", status: "skipped" }); }
  }

  if (formats.indexOf("epub") >= 0) {
    var f = new File(outputDir + "/" + baseName + ".epub");
    if (!f.exists || overwrite) {
      doc.exportFile(ExportFormat.EPUB, f, false);
      results.push({ doc: baseName, format: "epub", status: "ok" });
    } else { results.push({ doc: baseName, format: "epub", status: "skipped" }); }
  }

  if (formats.indexOf("idml") >= 0) {
    var f = new File(outputDir + "/" + baseName + ".idml");
    if (!f.exists || overwrite) {
      doc.exportFile(ExportFormat.INDESIGN_MARKUP, f, false);
      results.push({ doc: baseName, format: "idml", status: "ok" });
    } else { results.push({ doc: baseName, format: "idml", status: "skipped" }); }
  }

  if (formats.indexOf("html") >= 0) {
    var f = new File(outputDir + "/" + baseName + ".html");
    if (!f.exists || overwrite) {
      doc.exportFile(ExportFormat.HTML, f, false);
      results.push({ doc: baseName, format: "html", status: "ok" });
    } else { results.push({ doc: baseName, format: "html", status: "skipped" }); }
  }

  // Formatos de imagem (página por página)
  var imgFormats = [];
  if (formats.indexOf("jpg") >= 0) imgFormats.push({ name: "jpg", fmt: "JPG" });
  if (formats.indexOf("png") >= 0) imgFormats.push({ name: "png", fmt: "PNG" });
  if (formats.indexOf("tiff") >= 0) imgFormats.push({ name: "tiff", fmt: "TIFF" });
  if (formats.indexOf("eps") >= 0) imgFormats.push({ name: "eps", fmt: "EPS" });

  if (imgFormats.length > 0) {
    var pages = getPages(doc);
    for (var p = 0; p < pages.length; p++) {
      for (var fi = 0; fi < imgFormats.length; fi++) {
        var ext = imgFormats[fi].name;
        var fmtStr = imgFormats[fi].fmt;
        var f = new File(outputDir + "/" + baseName + "_" + pages[p].num + "." + ext);

        if (!f.exists || overwrite) {
          if (fmtStr === "JPG") {
            app.jpegExportPreferences.exportResolution = res;
            app.jpegExportPreferences.jpegQuality = jpgQual;
            app.jpegExportPreferences.antiAliasing = true;
            app.jpegExportPreferences.embedColorProfile = true;
          } else if (fmtStr === "PNG") {
            app.pngExportPreferences.exportResolution = res;
            app.pngExportPreferences.antiAliasing = true;
            app.pngExportPreferences.transparentBackground = true;
          } else if (fmtStr === "TIFF") {
            app.tiffExportPreferences.exportResolution = res;
            app.tiffExportPreferences.byteOrder = TIFFByteOrder.INTEL;
          }
          doc.exportFile(ExportFormat[fmtStr], f, false);
          results.push({ doc: baseName, format: ext, page: pages[p].num, status: "ok" });
        } else {
          results.push({ doc: baseName, format: ext, page: pages[p].num, status: "skipped" });
        }
      }
    }
  }
}
results;`;

    return runExtendScript(code);
  }
);

// ========================================================================
// TOOL 7: Manipulação de texto
// ========================================================================

server.tool(
  "get_text",
  t("get_text"),
  {
    target: z.enum(["selection", "page", "document", "frame"]).describe(t("readTarget")),
    page: z.number().int().positive().optional().describe(t("targetPage")),
    frameIndex: z.number().int().nonnegative().optional().describe(t("targetFrame")),
  },
  async ({ target, page, frameIndex }) => {
    let code: string;

    if (target === "selection") {
      code = `
if (app.selection.length === 0) throw new Error(${jsxString(t("noSelection"))});
var texts = [];
for (var i = 0; i < app.selection.length; i++) {
  var sel = app.selection[i];
  if (sel.hasOwnProperty("contents")) {
    texts.push({ type: sel.constructor.name, text: sel.contents.toString() });
  } else {
    texts.push({ type: sel.constructor.name, text: ${jsxString(t("noText"))} });
  }
}
texts;`;
    } else if (target === "page") {
      const pageNum = page || 1;
      code = `
var doc = app.documents[0];
var page = doc.pages[${pageNum - 1}];
var texts = [];
var textsOnPage = page.texts;
for (var i = 0; i < textsOnPage.length; i++) {
  if (textsOnPage[i].contents && textsOnPage[i].contents.toString().trim() !== "") {
    texts.push({ index: i, text: textsOnPage[i].contents.toString() });
  }
}
texts;`;
    } else if (target === "document") {
      code = `
var doc = app.documents[0];
var allText = doc.texts.everyItem().getElements();
var result = [];
for (var i = 0; i < allText.length; i++) {
  var t = allText[i].contents.toString().trim();
  if (t !== "") result.push({ index: i, text: t });
}
result;`;
    } else {
      // frame
      const idx = frameIndex || 0;
      code = `
var doc = app.documents[0];
var page = doc.pages[0];
var frames = page.textFrames;
if (${idx} >= frames.length) throw new Error(${jsxString(t("frameNotFound"))} + ": ${idx} (" + ${jsxString(t("maximum"))} + ": " + (frames.length - 1) + ")");
var frame = frames[${idx}];
{ text: frame.contents.toString(), geometricBounds: frame.geometricBounds.toString() };`;
    }

    return runExtendScript(code);
  }
);

// ========================================================================
// TOOL 8: Inserir texto
// ========================================================================

server.tool(
  "insert_text",
  t("insert_text"),
  {
    text: z.string().describe(t("textInsert")),
    frameIndex: z.number().int().nonnegative().default(0).describe(t("frameIndex")),
    page: z.number().int().positive().default(1).describe(t("pageNumber")),
    append: z.boolean().default(false).describe(t("append")),
  },
  async ({ text, frameIndex, page, append }) => {
    const code = `
var doc = app.documents[0];
var page = doc.pages[${page - 1}];
var frames = page.textFrames;
if (${frameIndex} >= frames.length) throw new Error(${jsxString(t("frameNotFound"))} + ": ${frameIndex}, " + ${jsxString(t("pageLabel"))} + " ${page}");

var frame = frames[${frameIndex}];
var texto = ${JSON.stringify(text)};

if (${append}) {
  frame.insertionPoints[-1].contents = texto;
} else {
  frame.contents = texto;
}

{ success: true, frameIndex: ${frameIndex}, page: ${page}, length: texto.length };`;

    return runExtendScript(code);
  }
);

// ========================================================================
// TOOL 9: Substituir texto
// ========================================================================

server.tool(
  "replace_text",
  t("replace_text"),
  {
    search: z.string().describe(t("search")),
    replace: z.string().describe(t("replace")),
    scope: z.enum(["document", "selection"]).default("document").describe(t("replaceScope")),
    caseSensitive: z.boolean().default(false).describe(t("caseSensitive")),
    wholeWord: z.boolean().default(false).describe(t("wholeWord")),
  },
  async ({ search, replace, scope, caseSensitive, wholeWord }) => {
    const code = `
var doc = app.documents[0];
var searchText = ${JSON.stringify(search)};
var replaceText = ${JSON.stringify(replace)};
var searchObj;

if ("${scope}" === "selection" && app.selection.length > 0) {
  searchObj = app.selection[0];
} else {
  searchObj = doc;
}

var found = searchObj.findText();
var count = 0;
for (var i = 0; i < found.length; i++) {
  if (found[i].hasOwnProperty("contents")) {
    found[i].contents = replaceText;
    count++;
  }
}

{ replaced: count, search: searchText, replace: replaceText };`;

    return runExtendScript(code);
  }
);

// ========================================================================
// TOOL 10: Executar ExtendScript arbitrário
// ========================================================================

server.tool(
  "run_jsx",
  t("run_jsx"),
  {
    code: z.string().describe(t("jsxCode")),
    waitForResult: z.boolean().default(true).describe(t("waitForResult")),
  },
  async ({ code, waitForResult }) => {
    if (process.env.INDESIGN_MCP_ENABLE_RUN_JSX !== "1") {
      return {
        content: [{ type: "text", text: t("jsxDisabled") }],
        isError: true,
      };
    }
    return runExtendScript(code);
  }
);

// ========================================================================
// TOOL 11: Listar frames de texto
// ========================================================================

server.tool(
  "list_frames",
  t("list_frames"),
  {
    scope: z.enum(["page", "document", "selection"]).default("page").describe(t("listScope")),
    page: z.number().int().positive().default(1).describe(t("scopePage")),
  },
  async ({ scope, page }) => {
    let code: string;

    if (scope === "document") {
      code = `
var doc = app.documents[0];
var frames = doc.textFrames;
var result = [];
for (var i = 0; i < frames.length; i++) {
  var f = frames[i];
  result.push({
    index: i,
    contentType: f.constructor.name,
    geometricBounds: f.geometricBounds.toString(),
    contents: f.contents.toString().slice(0, 200)
  });
}
result;`;
    } else if (scope === "selection") {
      code = `
if (app.selection.length === 0) throw new Error(${jsxString(t("noSelection"))});
var sel = app.selection[0];
if (sel.hasOwnProperty("textFrames")) {
  var frames = sel.textFrames;
  var result = [];
  for (var i = 0; i < frames.length; i++) {
    result.push({ index: i, contents: frames[i].contents.toString().slice(0, 200) });
  }
  result;
} else {
  [{ type: sel.constructor.name, text: sel.contents ? sel.contents.toString().slice(0, 200) : ${jsxString(t("noTextShort"))} }];
}`;
    } else {
      code = `
var doc = app.documents[0];
var page = doc.pages[${page - 1}];
var frames = page.textFrames;
var result = [];
for (var i = 0; i < frames.length; i++) {
  var f = frames[i];
  result.push({
    index: i,
    geometricBounds: f.geometricBounds.toString(),
    contents: f.contents.toString().slice(0, 200)
  });
}
result;`;
    }

    return runExtendScript(code);
  }
);

// ========================================================================
// TOOL 12: Manipular frame de texto
// ========================================================================

server.tool(
  "set_frame_text",
  t("set_frame_text"),
  {
    text: z.string().describe(t("textInsert")),
    page: z.number().int().positive().default(1).describe(t("pageNumber")),
    frameIndex: z.number().int().nonnegative().default(0).describe(t("frameOnPage")),
    mode: z.enum(["replace", "append", "prepend"]).default("replace").describe(t("insertionMode")),
  },
  async ({ text, page, frameIndex, mode }) => {
    const code = `
var doc = app.documents[0];
var page = doc.pages[${page - 1}];
var frames = page.textFrames;
if (${frameIndex} >= frames.length) throw new Error(${jsxString(t("frameNotFound"))} + ": ${frameIndex}, " + ${jsxString(t("pageLabel"))} + " ${page} (" + ${jsxString(t("maximum"))} + ": " + (frames.length - 1) + ")");

var frame = frames[${frameIndex}];
var texto = ${JSON.stringify(text)};

if ("${mode}" === "replace") {
  frame.contents = texto;
} else if ("${mode}" === "append") {
  frame.insertionPoints[-1].contents = texto;
} else {
  frame.insertionPoints[0].contents = texto;
}

{ success: true, mode: "${mode}", frameIndex: ${frameIndex}, page: ${page}, length: texto.length };`;

    return runExtendScript(code);
  }
);

// ========================================================================
// TOOL 13: Listar estilos
// ========================================================================

server.tool(
  "list_styles",
  t("list_styles"),
  {
    styleType: z.enum(["paragraph", "character", "object", "table", "cell"]).default("paragraph").describe(t("styleType")),
  },
  async ({ styleType }) => {
    const typeMap = {
      paragraph: "paragraphStyles",
      character: "characterStyles",
      object: "objectStyles",
      table: "tableStyles",
      cell: "cellStyles",
    };

    const code = `
var doc = app.documents[0];
var styles = doc.${typeMap[styleType]};
var result = [];
for (var i = 0; i < styles.length; i++) {
  result.push({ name: styles[i].name, index: i });
}
result;`;

    return runExtendScript(code);
  }
);

// ========================================================================
// TOOL 14: Aplicar estilo
// ========================================================================

server.tool(
  "apply_style",
  t("apply_style"),
  {
    styleName: z.string().describe(t("styleName")),
    styleType: z.enum(["paragraph", "character"]).default("paragraph").describe(t("styleType")),
    target: z.enum(["selection", "frame"]).default("selection").describe(t("styleTarget")),
    page: z.number().int().positive().default(1).describe(t("framePage")),
    frameIndex: z.number().int().nonnegative().default(0).describe(t("targetFrameIndex")),
  },
  async ({ styleName, styleType, target, page, frameIndex }) => {
    const prop = styleType === "paragraph" ? "paragraphStyles" : "characterStyles";
    const applyMethod = styleType === "paragraph" ? "appliedParagraphStyle" : "appliedCharacterStyle";

    const code = `
var doc = app.documents[0];
var styleName = ${JSON.stringify(styleName)};
var style;

// Procura o estilo
var styles = doc.${prop};
for (var i = 0; i < styles.length; i++) {
  if (styles[i].name === styleName) { style = styles[i]; break; }
}
if (!style) throw new Error(${jsxString(t("styleNotFound"))} + ": " + styleName);

if ("${target}" === "selection") {
  if (app.selection.length === 0) throw new Error(${jsxString(t("noStyleSelection"))});
  app.selection[0].${applyMethod} = style;
  { applied: true, style: styleName, target: "selection" };
} else {
  var page = doc.pages[${page - 1}];
  var frames = page.textFrames;
  if (${frameIndex} >= frames.length) throw new Error(${jsxString(t("frameNotFound"))});
  frames[${frameIndex}].${applyMethod} = style;
  { applied: true, style: styleName, target: "frame", page: ${page}, frameIndex: ${frameIndex} };
}`;

    return runExtendScript(code);
  }
);

// ========================================================================
// TOOL 15: Listar e criar cores
// ========================================================================

server.tool(
  "list_colors",
  t("list_colors"),
  {
    swatchType: z.enum(["color", "gradient", "tint", "all"]).default("color").describe(t("swatchType")),
  },
  async ({ swatchType }) => {
    const code = `
var doc = app.documents[0];
var swatches = doc.colors;
var result = [];
for (var i = 0; i < swatches.length; i++) {
  var s = swatches[i];
  result.push({
    name: s.name,
    colorValue: s.colorValue.toString(),
    model: s.colorModel.toString(),
    space: s.space ? s.space.toString() : "N/A"
  });
}
result;`;

    return runExtendScript(code);
  }
);

server.tool(
  "create_color_swatch",
  t("create_color_swatch"),
  {
    name: z.string().describe(t("colorName")),
    model: z.enum(["process", "spot"]).default("process").describe(t("colorModel")),
    colorSpace: z.enum(["RGB", "CMYK", "LAB", "GRAY"]).default("RGB").describe(t("colorSpace")),
    values: z.array(z.number()).describe(t("colorValues")),
  },
  async ({ name, model, colorSpace, values }) => {
    const code = `
var doc = app.documents[0];
try {
  var color = doc.colors.add({
    name: ${JSON.stringify(name)},
    model: ColorModel.${model === "process" ? "process" : "spot"},
    space: ColorSpace.${colorSpace},
    colorValue: [${values.join(", ")}]
  });
  { created: true, name: color.name, model: color.model.toString(), space: color.space.toString() };
} catch(e) {
  throw new Error(${jsxString(t("colorFailed"))} + String(e));
}`;

    return runExtendScript(code);
  }
);

// ========================================================================
// TOOL 16: Informações de página
// ========================================================================

server.tool(
  "get_page_info",
  t("get_page_info"),
  {
    page: z.number().int().positive().default(1).describe(t("pageNumber")),
  },
  async ({ page }) => {
    const code = `
var doc = app.documents[0];
var page = doc.pages[${page - 1}];
var margin = page.marginPreferences;
var result = {
  pageNumber: ${page},
  name: page.name,
  margin: {
    top: margin.top,
    left: margin.left,
    bottom: margin.bottom,
    right: margin.right
  },
  pageHeight: page.bounds[2] - page.bounds[0],
  pageWidth: page.bounds[3] - page.bounds[1],
  textFrameCount: page.textFrames.length,
  imageFrameCount: page.rectangles.length,
  masterSpread: page.masterSpread ? page.masterSpread.name : null,
  sections: page.sections ? page.sections.length : 0
};
result;`;

    return runExtendScript(code);
  }
);

// ========================================================================
// TOOL 17: Criar frame de texto
// ========================================================================

server.tool(
  "create_text_frame",
  t("create_text_frame"),
  {
    text: z.string().optional().describe(t("initialText")),
    page: z.number().int().positive().default(1).describe(t("pageNumber")),
    geometricBounds: z.array(z.number()).length(4).describe(t("bounds")),
  },
  async ({ text, page, geometricBounds }) => {
    const bounds = JSON.stringify(geometricBounds);
    const textContent = text ? JSON.stringify(text) : "null";

    const code = `
var doc = app.documents[0];
var page = doc.pages[${page - 1}];
var bounds = ${bounds};
var frame = page.textFrames.add({ geometricBounds: bounds });
if (${textContent} !== null) {
  frame.contents = ${textContent};
}
{ created: true, page: ${page}, geometricBounds: bounds.toString(), textLength: ${textContent} !== null ? ${textContent}.length : 0 };`;

    return runExtendScript(code);
  }
);

// ========================================================================
// TOOL 18: Exportar documento ativo (atalho rápido)
// ========================================================================

server.tool(
  "quick_export",
  t("quick_export"),
  {
    format: z.enum(["pdf", "jpg", "png", "tiff", "eps", "epub", "idml", "html"]).describe(t("exportFormat")),
    outputPath: z.string().describe(t("outputPath")),
    pdfPreset: z.string().optional().describe(t("pdfOnlyPreset")),
    resolution: z.number().int().min(72).max(1200).default(300).describe(t("imageOnlyResolution")),
    pageRange: z.string().optional().describe(t("imageOnlyRange")),
  },
  async ({ format, outputPath, pdfPreset, resolution, pageRange }) => {
    const fmtMap: Record<string, string> = {
      pdf: "PDF_TYPE",
      jpg: "JPG",
      png: "PNG",
      tiff: "TIFF",
      eps: "EPS",
      epub: "EPUB",
      idml: "INDESIGN_MARKUP",
      html: "HTML",
    };

    const outPath = outputPath.replace(/\\/g, "\\\\\\\\");
    const preset = pdfPreset || "[High Quality Print]";
    const range = pageRange || null;

    const code = `
var doc = app.documents[0];
var outFile = new File(${jsxString(outputPath)});
var fmt = "${fmtMap[format]}";

if (fmt === "PDF_TYPE") {
var preset = app.pdfExportPresets.itemByName(${jsxString(preset)});
  if (!preset.isValid) preset = app.pdfExportPresets.item(0);
  doc.exportFile(ExportFormat.PDF_TYPE, outFile, false, preset);
} else if (fmt === "JPG") {
  app.jpegExportPreferences.exportResolution = ${resolution};
  app.jpegExportPreferences.jpegQuality = 3;
  doc.exportFile(ExportFormat.JPG, outFile, false);
} else if (fmt === "PNG") {
  app.pngExportPreferences.exportResolution = ${resolution};
  doc.exportFile(ExportFormat.PNG, outFile, false);
} else if (fmt === "TIFF") {
  app.tiffExportPreferences.exportResolution = ${resolution};
  doc.exportFile(ExportFormat.TIFF, outFile, false);
} else if (fmt === "EPS") {
  doc.exportFile(ExportFormat.EPS, outFile, false);
} else if (fmt === "EPUB") {
  doc.exportFile(ExportFormat.EPUB, outFile, false);
} else if (fmt === "INDESIGN_MARKUP") {
  doc.exportFile(ExportFormat.INDESIGN_MARKUP, outFile, false);
} else if (fmt === "HTML") {
  doc.exportFile(ExportFormat.HTML, outFile, false);
}

outFile = null;
{ success: true, format: ${jsxString(format)}, outputPath: ${jsxString(outputPath)} };`;

    return runExtendScript(code);
  }
);

// ========================================================================
// CONEXÃO E INÍCIO
// ========================================================================

async function main() {
  // IMPORTANTE: em ambientes stdio (não-TTY), o stdin precisa ser
  // colocado em modo "flowing" explicitamente para que o
  // StdioServerTransport receba eventos 'data'.
  if (process.stdin.isTTY === false) {
    process.stdin.resume();
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[indesign-mcp]", t("ready"));
  console.error("[indesign-mcp]", t("timeout"), defaultEnv.timeoutMs + "ms");
  console.error("[indesign-mcp]", t("platform"), process.platform, `(${language})`);
}

main().catch((err) => {
  console.error("[indesign-mcp]", t("fatal"), err);
  process.exit(1);
});
