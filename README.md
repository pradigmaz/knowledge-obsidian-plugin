<div align="center">
  
  <img src="https://obsidian.md/images/obsidian-logo-gradient.svg" alt="Obsidian Logo" width="120" height="120" />

  <h1>Knowledge Analytics for Obsidian</h1>

  <p>
    <b>Advanced graph analytics, Google OKF validation, and context hygiene for your vault.</b>
  </p>

  <p>
    <b>🇺🇸 English</b> | <a href="README.ru.md">🇷🇺 Русский</a>
  </p>

  <p>
    <a href="https://github.com/pradigmaz/knowledge-obsidian-plugin/releases"><img src="https://img.shields.io/github/v/release/pradigmaz/knowledge-obsidian-plugin?style=for-the-badge&color=blue" alt="Release"></a>
    <a href="https://github.com/pradigmaz/knowledge-obsidian-plugin/blob/master/LICENSE"><img src="https://img.shields.io/github/license/pradigmaz/knowledge-obsidian-plugin?style=for-the-badge&color=success" alt="License"></a>
    <a href="https://obsidian.md/"><img src="https://img.shields.io/badge/Obsidian-v1.6.0+-483699?style=for-the-badge&logo=obsidian" alt="Obsidian Version"></a>
  </p>

  <p>
    <i>This plugin serves as the underlying data engine for the <a href="https://github.com/pradigmaz/obsidian-mcp-server">obsidian-knowledge-mcp</a> server.</i>
  </p>
</div>

---

## ⚠️ Required Dependencies

> **IMPORTANT:** To enable full-text search and BM25 ranking, this plugin **strictly requires** the [Omnisearch](https://github.com/scambier/obsidian-omnisearch) plugin to be installed and enabled in your vault.

---

## 🌟 Overview

**Knowledge Analytics** enforces structural boundaries and performs heavy graph analysis that native Obsidian does not natively support. It is designed to keep your vault clean, scalable, and readable for both humans and autonomous AI agents.

### 🛡️ Core Features

- **Google OKF (Open Knowledge Format) Validation:** Automatically scans notes for structural compliance. Notes missing the mandatory `type` and `summary`/`description` frontmatter fields are flagged by the Janitor scanner. Read the [Google OKF Spec](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) for details.
- **BFS Route Tracing:** Graph algorithm to find the shortest path of connections between any two notes in your vault (up to a 2000-node limit).
- **Lineage Demotion:** Auto-generated files, logs, and daily dumps are algorithmically penalized in search results so they don't pollute your primary knowledge base.
- **Concept Clustering:** Analyzes a note's immediate neighborhood to surface cross-links and semantic neighbors.
- **Vault Health Reports:** Generates a brief of your workspace, highlighting orphaned notes, empty hubs, and metadata regressions.

---

## ⚙️ Installation

### Option A: Manual Installation (Recommended for Production)
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [Release](https://github.com/pradigmaz/knowledge-obsidian-plugin/releases).
2. Create a folder named `knowledge` inside your `.obsidian/plugins/` directory.
3. Place the downloaded files into that folder.
4. Reload Obsidian and enable **Knowledge Analytics** in Community Plugins.

### Option B: Using BRAT (For Beta Testing)
1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from the Community Plugins list.
2. Add `pradigmaz/knowledge-obsidian-plugin` to your BRAT repository list.
3. Enable **Knowledge Analytics** in Community Plugins.

---

## 🚀 Usage

The plugin operates entirely in the background, listening on port `27125`. It responds to internal REST API calls made by the `obsidian-mcp-server`. There is no visual UI or command palette interaction required.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
