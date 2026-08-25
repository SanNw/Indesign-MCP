<div align="center">

![InDesign MCP](https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=12,14,18&height=210&section=header&text=InDesign%20MCP&fontSize=58&fontColor=ffffff&animation=fadeIn&fontAlignY=36&desc=Adobe%20InDesign%20automation%20through%20Model%20Context%20Protocol&descAlignY=58&descSize=16)

[![Typing SVG](https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=500&size=18&duration=2800&pause=900&color=FF3366&center=true&vCenter=true&width=680&lines=Control+InDesign+from+your+AI+assistant;Edit+text%2C+styles%2C+colors+and+frames;Export+PDF%2C+images%2C+EPUB%2C+IDML+and+more)](https://github.com/DenverCoder1/readme-typing-svg)

[![npm version](https://img.shields.io/npm/v/mcp-indesign?style=for-the-badge&logo=npm&color=CB3837)](https://www.npmjs.com/package/mcp-indesign)
[![npm downloads](https://img.shields.io/npm/dm/mcp-indesign?style=for-the-badge&logo=npm&color=1f6feb)](https://www.npmjs.com/package/mcp-indesign)
[![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?style=for-the-badge&logo=windows11)](https://www.microsoft.com/windows)
[![License](https://img.shields.io/npm/l/mcp-indesign?style=for-the-badge&color=2ea44f)](LICENSE)

English | [Português](https://github.com/SanNw/Indesign-MCP/blob/main/README.pt-BR.md) | [Español](https://github.com/SanNw/Indesign-MCP/blob/main/README.es.md)

**Control Adobe InDesign directly from Codex, Claude, OpenCode, and other MCP clients.**

[Installation](#-npm-installation) · [Tools](#-tools) · [Security](#-security) · [Development](#-development)

</div>

---

**InDesign MCP** is a [Model Context Protocol](https://modelcontextprotocol.io/) server that automates Adobe InDesign on Windows through COM and ExtendScript. It enables AI assistants to inspect documents, edit content, and perform exports using structured tools.

## ✨ Highlights

- **19 tools** ready for editing, inspection, and export.
- **npm installation**, with no InDesign plugin or startup script required.
- **Native integration** with Codex, Claude Desktop, Claude Code, and OpenCode.
- **Local execution** over `stdio`; your documents are not sent through MCP.
- **Secure by default**, with arbitrary JSX execution disabled.

## 📋 Requirements

- Windows 10 or 11
- Adobe InDesign 2024 or later
- Node.js 18 or later
- PowerShell 5.1 or later

InDesign must be open while the server is in use. No startup script or firewall configuration is required.

## 📦 npm Installation

You do not need to clone the repository or install the package globally. Configure your MCP client to run:

```powershell
npx -y mcp-indesign
```

### Codex

Add the following to `~/.codex/config.toml`:

```toml
[mcp_servers.indesign]
command = "npx"
args = ["-y", "mcp-indesign"]
startup_timeout_sec = 30

[mcp_servers.indesign.env]
INDESIGN_MCP_LANGUAGE = "en"
```

### Claude Desktop or Claude Code

```json
{
  "mcpServers": {
    "indesign": {
      "command": "npx",
      "args": ["-y", "mcp-indesign"],
      "env": { "INDESIGN_MCP_LANGUAGE": "en" }
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
      "environment": { "INDESIGN_MCP_LANGUAGE": "en" },
      "enabled": true
    }
  }
}
```

Restart the client, open InDesign, and run `check_connection`.

## 🧰 Tools

| Tool | Function |
| --- | --- |
| `check_connection` | Checks communication with InDesign |
| `list_documents` | Lists open documents |
| `get_document_info` | Returns document pages and properties |
| `get_page_info` | Returns information about a page |
| `get_text` | Reads text from the selection, page, document, or frame |
| `insert_text` | Inserts text into a frame |
| `set_frame_text` | Replaces, appends, or prepends text |
| `replace_text` | Finds and replaces text |
| `list_frames` | Lists text frames |
| `create_text_frame` | Creates a text frame |
| `list_styles` | Lists document styles |
| `apply_style` | Applies styles to the selection or a frame |
| `list_colors` | Lists color swatches |
| `create_color_swatch` | Creates an RGB, CMYK, LAB, or GRAY swatch |
| `export_pdf` | Exports a PDF |
| `export_image` | Exports a JPG, PNG, or TIFF image |
| `quick_export` | Quickly exports to a selected format |
| `batch_export` | Exports multiple documents and formats |
| `run_jsx` | Runs ExtendScript when explicitly enabled |

## 🔐 Security

The runtime defaults to English. Set the interface language in your MCP environment when needed:

```text
INDESIGN_MCP_LANGUAGE=en     # English
INDESIGN_MCP_LANGUAGE=pt-BR  # Portuguese (pt and pt-PT are also accepted)
INDESIGN_MCP_LANGUAGE=es     # Spanish
```

`run_jsx` allows arbitrary ExtendScript execution and is disabled by default. Enable it only in trusted environments:

```text
INDESIGN_MCP_ENABLE_RUN_JSX=1
```

To use an external installation of `BatchExportProfessional.jsx`:

```text
INDESIGN_MCP_BATCH_SCRIPT=C:\path\BatchExportProfessional.jsx
```

## 🛠️ Development

```powershell
git clone https://github.com/SanNw/Indesign-MCP.git
cd Indesign-MCP
npm install
npm test
```

The test starts the server, validates all 19 tools, and confirms that `run_jsx` remains blocked by default.

## 🩺 Troubleshooting

- Run `check_connection` before using the other tools.
- Confirm that InDesign is open in the same Windows session.
- Restart the MCP client after changing its configuration.
- Export presets vary by InDesign version and language.

## ⚠️ Limitations

- The `0.1.x` series supports Windows only.
- Operations may modify the open document but do not save it automatically.
- Compatibility has been directly validated with InDesign 2025; other versions should be tested by the community.

## 📄 License

[MIT](LICENSE)

<div align="center">

Built to bring artificial intelligence and editorial design closer together.

![Footer](https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=12,14,18&height=110&section=footer)

</div>
