<div align="center">

![InDesign MCP](https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=12,14,18&height=210&section=header&text=InDesign%20MCP&fontSize=58&fontColor=ffffff&animation=fadeIn&fontAlignY=36&desc=Adobe%20InDesign%20automation%20through%20Model%20Context%20Protocol&descAlignY=58&descSize=16)

[![Typing SVG](https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=500&size=18&duration=2800&pause=900&color=FF3366&center=true&vCenter=true&width=680&lines=Control+InDesign+from+your+AI+assistant;Edit+text%2C+styles%2C+colors+and+frames;Export+PDF%2C+images%2C+EPUB%2C+IDML+and+more)](https://github.com/DenverCoder1/readme-typing-svg)

[![npm version](https://img.shields.io/npm/v/mcp-indesign?style=for-the-badge&logo=npm&color=CB3837)](https://www.npmjs.com/package/mcp-indesign)
[![npm downloads](https://img.shields.io/npm/dm/mcp-indesign?style=for-the-badge&logo=npm&color=1f6feb)](https://www.npmjs.com/package/mcp-indesign)
[![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?style=for-the-badge&logo=windows11)](https://www.microsoft.com/windows)
[![License](https://img.shields.io/npm/l/mcp-indesign?style=for-the-badge&color=2ea44f)](LICENSE)

**Controle o Adobe InDesign diretamente pelo Codex, Claude, OpenCode e outros clientes MCP.**

[Instalação](#-instalação-pelo-npm) · [Ferramentas](#-ferramentas) · [Segurança](#-segurança) · [Desenvolvimento](#-desenvolvimento)

</div>

---

O **InDesign MCP** é um servidor [Model Context Protocol](https://modelcontextprotocol.io/) que automatiza o Adobe InDesign no Windows por meio de COM e ExtendScript. Ele permite que assistentes de IA consultem documentos, editem conteúdo e executem exportações usando ferramentas estruturadas.

## ✨ Destaques

- **19 ferramentas** prontas para edição, inspeção e exportação.
- **Instalação por npm**, sem plugin ou script de inicialização no InDesign.
- **Integração nativa** com Codex, Claude Desktop, Claude Code e OpenCode.
- **Execução local** por `stdio`; seus documentos não são enviados pelo MCP.
- **Modo seguro por padrão**, com execução arbitrária de JSX desabilitada.

## 📋 Requisitos

- Windows 10 ou 11
- Adobe InDesign 2024 ou mais recente
- Node.js 18 ou mais recente
- PowerShell 5.1 ou mais recente

O InDesign deve estar aberto durante o uso. Nenhum script de inicialização ou ajuste de firewall é necessário.

## 📦 Instalação pelo npm

Não é necessário clonar o repositório nem instalar o pacote globalmente. Configure seu cliente MCP para executar:

```powershell
npx -y mcp-indesign
```

### Codex

Adicione a `~/.codex/config.toml`:

```toml
[mcp_servers.indesign]
command = "npx"
args = ["-y", "mcp-indesign"]
startup_timeout_sec = 30
```

### Claude Desktop ou Claude Code

```json
{
  "mcpServers": {
    "indesign": {
      "command": "npx",
      "args": ["-y", "mcp-indesign"]
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
      "enabled": true
    }
  }
}
```

Reinicie o cliente, abra o InDesign e execute `check_connection`.

## 🧰 Ferramentas

| Ferramenta | Função |
| --- | --- |
| `check_connection` | Verifica a comunicação com o InDesign |
| `list_documents` | Lista documentos abertos |
| `get_document_info` | Retorna páginas e propriedades do documento |
| `get_page_info` | Retorna informações de uma página |
| `get_text` | Lê texto da seleção, página, documento ou frame |
| `insert_text` | Insere texto em um frame |
| `set_frame_text` | Substitui, acrescenta ou prefixa texto |
| `replace_text` | Localiza e substitui texto |
| `list_frames` | Lista frames de texto |
| `create_text_frame` | Cria um frame de texto |
| `list_styles` | Lista estilos do documento |
| `apply_style` | Aplica estilos à seleção ou a um frame |
| `list_colors` | Lista amostras de cor |
| `create_color_swatch` | Cria uma amostra RGB, CMYK, LAB ou GRAY |
| `export_pdf` | Exporta PDF |
| `export_image` | Exporta JPG, PNG ou TIFF |
| `quick_export` | Exporta rapidamente para um formato escolhido |
| `batch_export` | Exporta múltiplos documentos e formatos |
| `run_jsx` | Executa ExtendScript quando habilitado explicitamente |

## 🔐 Segurança

`run_jsx` permite execução arbitrária de ExtendScript e fica desabilitado por padrão. Habilite somente em ambientes confiáveis:

```text
INDESIGN_MCP_ENABLE_RUN_JSX=1
```

Para usar uma instalação externa do `BatchExportProfessional.jsx`:

```text
INDESIGN_MCP_BATCH_SCRIPT=C:\caminho\BatchExportProfessional.jsx
```

## 🛠️ Desenvolvimento

```powershell
git clone https://github.com/SanNw/Indesign-MCP.git
cd Indesign-MCP
npm install
npm test
```

O teste inicia o servidor, valida as 19 ferramentas e confirma que `run_jsx` permanece bloqueado por padrão.

## 🩺 Solução de problemas

- Execute `check_connection` antes das outras ferramentas.
- Confirme que o InDesign está aberto na mesma sessão do Windows.
- Reinicie o cliente MCP depois de alterar a configuração.
- Presets de exportação variam conforme a versão e o idioma do InDesign.

## ⚠️ Limitações

- A série `0.1.x` suporta somente Windows.
- Operações podem modificar o documento aberto, mas não o salvam automaticamente.
- A compatibilidade foi validada diretamente com o InDesign 2025; outras versões devem ser testadas pela comunidade.

## 📄 Licença

[MIT](LICENSE)

<div align="center">

Feito para aproximar inteligência artificial e design editorial.

![Footer](https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=12,14,18&height=110&section=footer)

</div>
