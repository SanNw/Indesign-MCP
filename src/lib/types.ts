/**
 * Tipos compartilhados entre o MCP server e os tools.
 */

/** Resultado de uma operação de execução ExtendScript. */
export interface ScriptResult {
  /** Sucesso da operação */
  success: boolean;
  /** Dados retornados (JSON serializado pelo script) */
  data?: unknown;
  /** Mensagem de erro em caso de falha */
  error?: string;
  /** Código de saída do script (0 = sucesso) */
  exitCode?: number;
}

/** Configuração do ambiente InDesign. */
export interface InDesignEnv {
  /** Timeout de execução em milissegundos */
  timeoutMs: number;
}

/** Formato de exportação suportado. */
export type ExportFormat =
  | "pdf"
  | "jpg"
  | "png"
  | "tiff"
  | "eps"
  | "epub"
  | "idml"
  | "html";

/** Configuração de exportação. */
export interface ExportConfig {
  /** Formato de exportação */
  format: ExportFormat;
  /** Pasta de destino */
  outputDir: string;
  /** Documento alvo: "active" | "all" | nome específico */
  scope?: "active" | "all" | string;
  /** Intervalo de páginas (ex: "1-5,8,10-12") */
  pageRange?: string;
  /** Prefixo para nome de arquivo */
  prefix?: string;
  /** Sufixo para nome de arquivo */
  suffix?: string;
  /** Sobrescrever arquivos existentes */
  overwrite?: boolean;
  /** Preset PDF (se formato for pdf) */
  pdfPreset?: string;
  /** Resolução em DPI (imagens) */
  resolution?: number;
  /** Qualidade JPG (1-4) */
  jpgQuality?: number;
  /** Abrir pasta após exportação */
  openAfter?: boolean;
  /** Salvar log em arquivo */
  enableLogging?: boolean;
}

/** Informação de um documento aberto. */
export interface DocumentInfo {
  name: string;
  fullName: string;
  path: string;
  modified: boolean;
  pageCount: number;
  id: string;
}

/** Informação de uma página. */
export interface PageInfo {
  index: number;
  name: string;
  marginPreferences?: Record<string, unknown>;
}
