<div align="center">

![InDesign MCP](https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=12,14,18&height=210&section=header&text=InDesign%20MCP&fontSize=58&fontColor=ffffff&animation=fadeIn&fontAlignY=36&desc=Automatizacion%20de%20Adobe%20InDesign%20mediante%20Model%20Context%20Protocol&descAlignY=58&descSize=16)

[![Typing SVG](https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=500&size=18&duration=2800&pause=900&color=FF3366&center=true&vCenter=true&width=680&lines=Controla+InDesign+desde+tu+asistente+de+IA;Edita+textos%2C+estilos%2C+colores+y+marcos;Exporta+PDF%2C+imagenes%2C+EPUB%2C+IDML+y+mas)](https://github.com/DenverCoder1/readme-typing-svg)

[![npm version](https://img.shields.io/npm/v/mcp-indesign?style=for-the-badge&logo=npm&color=CB3837)](https://www.npmjs.com/package/mcp-indesign)
[![npm downloads](https://img.shields.io/npm/dm/mcp-indesign?style=for-the-badge&logo=npm&color=1f6feb)](https://www.npmjs.com/package/mcp-indesign)
[![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?style=for-the-badge&logo=windows11)](https://www.microsoft.com/windows)
[![License](https://img.shields.io/npm/l/mcp-indesign?style=for-the-badge&color=2ea44f)](LICENSE)

[English](README.md) | [Português](README.pt-BR.md) | Español

**Controla Adobe InDesign directamente desde Codex, Claude, OpenCode y otros clientes MCP.**

[Instalación](#-instalación-mediante-npm) · [Herramientas](#-herramientas) · [Seguridad](#-seguridad) · [Desarrollo](#-desarrollo)

</div>

---

**InDesign MCP** es un servidor [Model Context Protocol](https://modelcontextprotocol.io/) que automatiza Adobe InDesign en Windows mediante COM y ExtendScript. Permite que los asistentes de IA consulten documentos, editen contenido y realicen exportaciones mediante herramientas estructuradas.

## ✨ Características destacadas

- **19 herramientas** listas para editar, inspeccionar y exportar.
- **Instalación mediante npm**, sin plugins ni scripts de inicio en InDesign.
- **Integración nativa** con Codex, Claude Desktop, Claude Code y OpenCode.
- **Ejecución local** mediante `stdio`; el MCP no envía tus documentos.
- **Modo seguro de forma predeterminada**, con la ejecución arbitraria de JSX deshabilitada.

## 📋 Requisitos

- Windows 10 u 11
- Adobe InDesign 2024 o posterior
- Node.js 18 o posterior
- PowerShell 5.1 o posterior

InDesign debe estar abierto durante el uso. No se requiere ningún script de inicio ni ajuste del firewall.

## 📦 Instalación mediante npm

No es necesario clonar el repositorio ni instalar el paquete globalmente. Configura tu cliente MCP para ejecutar:

```powershell
npx -y mcp-indesign
```

### Codex

Añade lo siguiente a `~/.codex/config.toml`:

```toml
[mcp_servers.indesign]
command = "npx"
args = ["-y", "mcp-indesign"]
startup_timeout_sec = 30

[mcp_servers.indesign.env]
INDESIGN_MCP_LANGUAGE = "es"
```

### Claude Desktop o Claude Code

```json
{
  "mcpServers": {
    "indesign": {
      "command": "npx",
      "args": ["-y", "mcp-indesign"],
      "env": { "INDESIGN_MCP_LANGUAGE": "es" }
    }
  }
}
```

### OpenCode

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "indesign": {
      "type": "local",
      "command": ["npx", "-y", "mcp-indesign"],
      "environment": { "INDESIGN_MCP_LANGUAGE": "es" },
      "enabled": true
    }
  }
}
```

Reinicia el cliente, abre InDesign y ejecuta `check_connection`.

## 🧰 Herramientas

| Herramienta | Función |
| --- | --- |
| `check_connection` | Comprueba la comunicación con InDesign |
| `list_documents` | Enumera los documentos abiertos |
| `get_document_info` | Devuelve las páginas y propiedades del documento |
| `get_page_info` | Devuelve información sobre una página |
| `get_text` | Lee el texto de la selección, página, documento o marco |
| `insert_text` | Inserta texto en un marco |
| `set_frame_text` | Sustituye, añade o antepone texto |
| `replace_text` | Busca y sustituye texto |
| `list_frames` | Enumera los marcos de texto |
| `create_text_frame` | Crea un marco de texto |
| `list_styles` | Enumera los estilos del documento |
| `apply_style` | Aplica estilos a la selección o a un marco |
| `list_colors` | Enumera las muestras de color |
| `create_color_swatch` | Crea una muestra RGB, CMYK, LAB o GRAY |
| `export_pdf` | Exporta a PDF |
| `export_image` | Exporta a JPG, PNG o TIFF |
| `quick_export` | Exporta rápidamente al formato elegido |
| `batch_export` | Exporta varios documentos y formatos |
| `run_jsx` | Ejecuta ExtendScript cuando se habilita explícitamente |

## 🔐 Seguridad

El entorno de ejecución utiliza inglés de forma predeterminada. Define el idioma de la interfaz en el entorno MCP cuando sea necesario:

```text
INDESIGN_MCP_LANGUAGE=en     # Inglés
INDESIGN_MCP_LANGUAGE=pt-BR  # Portugués (también se aceptan pt y pt-PT)
INDESIGN_MCP_LANGUAGE=es     # Español
```

`run_jsx` permite la ejecución arbitraria de ExtendScript y está deshabilitado de forma predeterminada. Habilítalo únicamente en entornos de confianza:

```text
INDESIGN_MCP_ENABLE_RUN_JSX=1
```

Para utilizar una instalación externa de `BatchExportProfessional.jsx`:

```text
INDESIGN_MCP_BATCH_SCRIPT=C:\ruta\BatchExportProfessional.jsx
```

## 🛠️ Desarrollo

```powershell
git clone https://github.com/SanNw/Indesign-MCP.git
cd Indesign-MCP
npm install
npm test
```

La prueba inicia el servidor, valida las 19 herramientas y confirma que `run_jsx` permanece bloqueado de forma predeterminada.

## 🩺 Solución de problemas

- Ejecuta `check_connection` antes que las demás herramientas.
- Confirma que InDesign esté abierto en la misma sesión de Windows.
- Reinicia el cliente MCP después de modificar la configuración.
- Los ajustes preestablecidos de exportación varían según la versión y el idioma de InDesign.

## ⚠️ Limitaciones

- La serie `0.1.x` solo es compatible con Windows.
- Las operaciones pueden modificar el documento abierto, pero no lo guardan automáticamente.
- La compatibilidad se validó directamente con InDesign 2025; la comunidad deberá probar otras versiones.

## 📄 Licencia

[MIT](LICENSE)

<div align="center">

Creado para acercar la inteligencia artificial y el diseño editorial.

![Footer](https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=12,14,18&height=110&section=footer)

</div>
