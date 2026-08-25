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

const jsxString = (value: string) => JSON.stringify(value);

// ========================================================================
// INICIALIZAÇÃO DO SERVER
// ========================================================================

const server = new McpServer({
  name: "indesign-mcp",
  version: "0.1.0",
  description: "Control Adobe InDesign via ExtendScript bridge — export batch, text manipulation, document management",
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
            text: "Erro ao executar no InDesign: " + result.error,
          },
        ],
        isError: true,
      };
    }

    const text = result.data !== undefined && result.data !== null
      ? `✅ Sucesso!\n\n${JSON.stringify(result.data, null, 2)}`
      : `✅ Concluído (sem dados de retorno)`;

    return {
      content: [{ type: "text", text }],
    };
  } catch (e) {
    return {
      content: [
        {
          type: "text",
          text: `❌ Erro interno: ${String(e)}`,
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
  "Verifica se o Adobe InDesign está aberto e respondendo. Execute esta ferramenta antes de usar outras.",
  {},
  async () => {
    const connected = await checkInDesignConnection(defaultEnv);
    if (connected) {
      return {
        content: [
          {
            type: "text",
            text: "✅ Conectado ao Adobe InDesign!\n\nO InDesign está aberto e respondendo aos scripts ExtendScript. Você pode usar as outras ferramentas.",
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: `⚠️ InDesign não detectado ou não respondendo.\n\n1. Abra o Adobe InDesign no Windows\n2. Execute novamente esta ferramenta\n\nTempo limite por script: ${defaultEnv.timeoutMs}ms`,
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
  "Lista todos os documentos do InDesign que estão atualmente abertos.",
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
  "Obtém informações detalhadas de um documento do InDesign.",
  {
    document: z.string().describe("Nome do documento (ex: 'meu_doc.indd') ou 'active' para o documento ativo"),
  },
  async ({ document }) => {
    const code = `
var doc;
if (${document === "active" ? "true" : "false"}) {
  if (app.documents.length === 0) { throw new Error("Nenhum documento aberto"); }
  doc = app.documents[0];
} else {
  var targetName = ${jsxString(document)};
  doc = null;
  for (var i = 0; i < app.documents.length; i++) {
    if (app.documents[i].name === targetName) { doc = app.documents[i]; break; }
  }
  if (!doc) { throw new Error("Documento '" + targetName + "' não encontrado"); }
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
  "Exporta um ou todos os documentos abertos como PDF.",
  {
    outputDir: z.string().describe("Pasta de destino para os arquivos PDF"),
    document: z.string().optional().describe("'active' para apenas o doc ativo, 'all' para todos, ou nome específico"),
    pdfPreset: z.string().optional().describe("Nome do preset PDF (ex: '[High Quality Print]', '[Smallest File Size]')"),
    pageRange: z.string().optional().describe("Intervalo de páginas (ex: '1-5,8,10-12'). Opcional."),
    overwrite: z.boolean().optional().describe("Sobrescrever arquivos existentes"),
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
    return { skipped: true, file: name + ".pdf", reason: "já existe" };
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
  if (app.documents.length === 0) throw new Error("Nenhum documento aberto");
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
  if (!found) throw new Error("Documento '" + docName + "' não encontrado");
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
  "Exporta páginas de documentos como imagens JPG, PNG ou TIFF.",
  {
    outputDir: z.string().describe("Pasta de destino"),
    format: z.enum(["JPG", "PNG", "TIFF"]).describe("Formato de imagem"),
    document: z.string().optional().describe("'active', 'all' ou nome específico"),
    pageRange: z.string().optional().describe("Intervalo de páginas (ex: '1-3,5')"),
    resolution: z.number().int().min(72).max(1200).optional().describe("Resolução em DPI"),
    quality: z.number().int().min(1).max(4).optional().describe("Qualidade JPG (1=Máx, 4=Baixa)"),
    overwrite: z.boolean().optional().describe("Sobrescrever existentes"),
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
  if (app.documents.length === 0) throw new Error("Nenhum documento aberto");
    docs.push(app.documents[0]);
} else if (docName === "all") {
  for (var i = 0; i < app.documents.length; i++) docs.push(app.documents[i]);
} else {
  for (var i = 0; i < app.documents.length; i++) {
    if (app.documents[i].name === docName) { docs.push(app.documents[i]); break; }
  }
  if (docs.length === 0) throw new Error("Documento '" + docName + "' não encontrado");
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
  "Executa a exportação em lote usando o script BatchExportProfessional.jsx existente. Ideal para exportar múltiplos formatos de uma vez.",
  {
    outputDir: z.string().describe("Pasta de destino para todos os arquivos"),
    formats: z.array(z.enum(["pdf", "jpg", "png", "tiff", "eps", "epub", "idml", "html"])).describe("Formatos a exportar"),
    document: z.enum(["active", "all"]).describe("Escopo: 'active' (apenas doc ativo) ou 'all' (todos os abertos)"),
    pageRange: z.string().optional().describe("Intervalo de páginas para imagens (ex: '1-5,8')"),
    pdfPreset: z.string().optional().describe("Preset PDF a usar"),
    jpgQuality: z.number().int().min(1).max(4).optional().describe("Qualidade JPG (1-4)"),
    resolution: z.number().int().min(72).max(1200).optional().describe("Resolução DPI para imagens"),
    overwrite: z.boolean().optional().describe("Sobrescrever arquivos existentes"),
    enableLogging: z.boolean().optional().describe("Salvar log em arquivo"),
    openAfter: z.boolean().optional().describe("Abrir pasta após exportação"),
    useBatchScript: z.boolean().optional().describe("Se true, usa BatchExportProfessional.jsx diretamente. Se false, gera ExtendScript dinâmico."),
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
          content: [{ type: "text", text: "Defina INDESIGN_MCP_BATCH_SCRIPT com o caminho do BatchExportProfessional.jsx ou use useBatchScript=false." }],
          isError: true,
        };
      }
      // Normaliza caminho para ExtendScript (usa /)
      const batchJsx = batchScriptPath.replace(/\\/g, "/");

      const code = `
// Wrapper para invocar BatchExportProfessional.jsx
var batchPath = new File(${jsxString(batchJsx)});
if (!batchPath.exists) throw new Error("BatchExportProfessional.jsx não encontrado: " + batchPath.fsName);

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
var result = app.extractLabel("batchExportResult") || "Exportação concluída (sem retorno detalhado)";
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

if (docs.length === 0) throw new Error("Nenhum documento para exportar");

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
  "Lê texto de frames, parágrafos ou páginas do documento ativo.",
  {
    target: z.enum(["selection", "page", "document", "frame"]).describe("O que ler: seleção atual, página inteira, documento todo ou frame específico"),
    page: z.number().int().positive().optional().describe("Número da página (quando target='page')"),
    frameIndex: z.number().int().nonnegative().optional().describe("Índice do frame na página (quando target='frame')"),
  },
  async ({ target, page, frameIndex }) => {
    let code: string;

    if (target === "selection") {
      code = `
if (app.selection.length === 0) throw new Error("Nenhuma seleção");
var texts = [];
for (var i = 0; i < app.selection.length; i++) {
  var sel = app.selection[i];
  if (sel.hasOwnProperty("contents")) {
    texts.push({ type: sel.constructor.name, text: sel.contents.toString() });
  } else {
    texts.push({ type: sel.constructor.name, text: "(objeto sem conteúdo de texto)" });
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
if (${idx} >= frames.length) throw new Error("Frame de índice ${idx} não encontrado (máximo: " + (frames.length - 1) + ")");
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
  "Insere texto em um frame de texto no documento ativo.",
  {
    text: z.string().describe("Texto a inserir"),
    frameIndex: z.number().int().nonnegative().default(0).describe("Índice do frame de texto (0 = primeiro)"),
    page: z.number().int().positive().default(1).describe("Número da página"),
    append: z.boolean().default(false).describe("Se true, anexa ao texto existente em vez de substituir"),
  },
  async ({ text, frameIndex, page, append }) => {
    const code = `
var doc = app.documents[0];
var page = doc.pages[${page - 1}];
var frames = page.textFrames;
if (${frameIndex} >= frames.length) throw new Error("Frame de índice ${frameIndex} não encontrado na página ${page}");

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
  "Substitui texto no documento ativo.",
  {
    search: z.string().describe("Texto a ser substituído"),
    replace: z.string().describe("Texto de substituição"),
    scope: z.enum(["document", "selection"]).default("document").describe("Escopo da substituição"),
    caseSensitive: z.boolean().default(false).describe("Diferenciar maiúsculas/minúsculas"),
    wholeWord: z.boolean().default(false).describe("Correspondência de palavra inteira"),
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
  "Executa um código ExtendScript arbitrário no InDesign. Use para automações personalizadas não cobertas por outras tools.",
  {
    code: z.string().describe("Código ExtendScript (JavaScript) a ser executado no InDesign. Atenção: execute apenas código confiável."),
    waitForResult: z.boolean().default(true).describe("Se true, aguarda o resultado (até timeout). Se false, executa e retorna imediatamente."),
  },
  async ({ code, waitForResult }) => {
    if (process.env.INDESIGN_MCP_ENABLE_RUN_JSX !== "1") {
      return {
        content: [{ type: "text", text: "run_jsx está desabilitado. Defina INDESIGN_MCP_ENABLE_RUN_JSX=1 para permitir execução arbitrária." }],
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
  "Lista todos os frames de texto em uma página ou documento.",
  {
    scope: z.enum(["page", "document", "selection"]).default("page").describe("Escopo da listagem"),
    page: z.number().int().positive().default(1).describe("Número da página (quando scope='page')"),
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
if (app.selection.length === 0) throw new Error("Nenhuma seleção");
var sel = app.selection[0];
if (sel.hasOwnProperty("textFrames")) {
  var frames = sel.textFrames;
  var result = [];
  for (var i = 0; i < frames.length; i++) {
    result.push({ index: i, contents: frames[i].contents.toString().slice(0, 200) });
  }
  result;
} else {
  [{ type: sel.constructor.name, text: sel.contents ? sel.contents.toString().slice(0, 200) : "(sem texto)" }];
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
  "Define ou anexa texto a um frame de texto específico.",
  {
    text: z.string().describe("Texto a inserir"),
    page: z.number().int().positive().default(1).describe("Número da página"),
    frameIndex: z.number().int().nonnegative().default(0).describe("Índice do frame na página"),
    mode: z.enum(["replace", "append", "prepend"]).default("replace").describe("Modo de inserção"),
  },
  async ({ text, page, frameIndex, mode }) => {
    const code = `
var doc = app.documents[0];
var page = doc.pages[${page - 1}];
var frames = page.textFrames;
if (${frameIndex} >= frames.length) throw new Error("Frame ${frameIndex} não encontrado na página ${page} (máximo: " + (frames.length - 1) + ")");

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
  "Lista estilos de parágrafo, caracteres e outros no documento ativo.",
  {
    styleType: z.enum(["paragraph", "character", "object", "table", "cell"]).default("paragraph").describe("Tipo de estilo"),
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
  "Aplica um estilo de parágrafo ou caractere a texto selecionado ou a um frame.",
  {
    styleName: z.string().describe("Nome do estilo a aplicar"),
    styleType: z.enum(["paragraph", "character"]).default("paragraph").describe("Tipo de estilo"),
    target: z.enum(["selection", "frame"]).default("selection").describe("Alvo: seleção atual ou frame"),
    page: z.number().int().positive().default(1).describe("Página do frame (quando target='frame')"),
    frameIndex: z.number().int().nonnegative().default(0).describe("Índice do frame (quando target='frame')"),
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
if (!style) throw new Error("Estilo '" + styleName + "' não encontrado");

if ("${target}" === "selection") {
  if (app.selection.length === 0) throw new Error("Nenhuma seleção para aplicar estilo");
  app.selection[0].${applyMethod} = style;
  { applied: true, style: styleName, target: "selection" };
} else {
  var page = doc.pages[${page - 1}];
  var frames = page.textFrames;
  if (${frameIndex} >= frames.length) throw new Error("Frame não encontrado");
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
  "Lista todas as cores e tintas (swatches) no documento ativo.",
  {
    swatchType: z.enum(["color", "gradient", "tint", "all"]).default("color").describe("Tipo de swatch"),
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
  "Cria uma nova cor (swatch) no documento ativo.",
  {
    name: z.string().describe("Nome da cor"),
    model: z.enum(["process", "spot"]).default("process").describe("Modelo de cor"),
    colorSpace: z.enum(["RGB", "CMYK", "LAB", "GRAY"]).default("RGB").describe("Espaço de cor"),
    values: z.array(z.number()).describe("Valores da cor (ex: [255, 0, 0] para RGB vermelho)"),
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
  throw new Error("Falha ao criar cor: " + String(e));
}`;

    return runExtendScript(code);
  }
);

// ========================================================================
// TOOL 16: Informações de página
// ========================================================================

server.tool(
  "get_page_info",
  "Obtém informações detalhadas de uma página específica.",
  {
    page: z.number().int().positive().default(1).describe("Número da página"),
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
  "Cria um novo frame de texto em uma página com as dimensões especificadas.",
  {
    text: z.string().optional().describe("Texto inicial do frame"),
    page: z.number().int().positive().default(1).describe("Número da página"),
    geometricBounds: z.array(z.number()).length(4).describe("Limites [topo, esquerda, fundo, direita] em pontos"),
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
  "Exporta o documento ativo rapidamente para um formato específico.",
  {
    format: z.enum(["pdf", "jpg", "png", "tiff", "eps", "epub", "idml", "html"]).describe("Formato de exportação"),
    outputPath: z.string().describe("Caminho completo do arquivo de saída"),
    pdfPreset: z.string().optional().describe("Preset PDF (apenas para PDF)"),
    resolution: z.number().int().min(72).max(1200).default(300).describe("Resolução DPI (imagens)"),
    pageRange: z.string().optional().describe("Intervalo de páginas (imagens)"),
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

  console.error("[indesign-mcp] Servidor pronto. Aguardando conexões...");
  console.error("[indesign-mcp] Timeout:", defaultEnv.timeoutMs + "ms");
  console.error("[indesign-mcp] Plataforma:", process.platform);
}

main().catch((err) => {
  console.error("[indesign-mcp] Erro fatal:", err);
  process.exit(1);
});
