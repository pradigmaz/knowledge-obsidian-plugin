<div align="center">
  
  <img src="https://obsidian.md/images/obsidian-logo-gradient.svg" alt="Логотип Obsidian" width="120" height="120" />

  <h1>Knowledge Analytics для Obsidian</h1>

  <p>
    <b>Продвинутая графовая аналитика, валидация Google OKF и гигиена контекста для вашего хранилища.</b>
  </p>

  <p>
    <a href="README.md">🇺🇸 English</a> | <b>🇷🇺 Русский</b>
  </p>

  <p>
    <a href="https://github.com/pradigmaz/knowledge-obsidian-plugin/releases"><img src="https://img.shields.io/github/v/release/pradigmaz/knowledge-obsidian-plugin?style=for-the-badge&color=blue" alt="Релиз"></a>
    <a href="https://github.com/pradigmaz/knowledge-obsidian-plugin/blob/master/LICENSE"><img src="https://img.shields.io/github/license/pradigmaz/knowledge-obsidian-plugin?style=for-the-badge&color=success" alt="Лицензия"></a>
    <a href="https://obsidian.md/"><img src="https://img.shields.io/badge/Obsidian-v1.6.0+-483699?style=for-the-badge&logo=obsidian" alt="Версия Obsidian"></a>
  </p>

  <p>
    <i>Этот плагин служит движком данных для сервера <a href="https://github.com/pradigmaz/obsidian-mcp-server">obsidian-knowledge-mcp</a>.</i>
  </p>
</div>

---

## ⚠️ Обязательные зависимости

> **ВАЖНО:** Для работы полнотекстового поиска и ранжирования BM25 **обязательно** установите и включите плагин [Omnisearch](https://github.com/scambier/obsidian-omnisearch) в вашем хранилище Obsidian.

---

## 🌟 Обзор

**Knowledge Analytics** следит за структурными границами и выполняет тяжелый графовый анализ, который Obsidian не поддерживает из коробки. Плагин создавался для того, чтобы хранилище оставалось чистым и масштабируемым — как для людей, так и для автономных ИИ-агентов.

### 🛡️ Основные возможности

- **Валидация Google OKF (Open Knowledge Format):** Автоматическая проверка структуры заметок. Файлы без обязательных полей `type` и `summary`/`description` во frontmatter помечаются встроенным сканнером Janitor. Подробнее в [спецификации Google OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md).
- **Обход графа (BFS):** Графовый алгоритм поиска кратчайшего пути между двумя любыми заметками (до 2000 узлов).
- **Пенализация логов (Lineage Demotion):** Автоматически сгенерированные файлы, логи и дейлики пенализируются в результатах поиска, чтобы не засорять базу знаний.
- **Кластеризация концептов (Concept Clustering):** Анализ ближайшего окружения заметки для поиска кросс-ссылок и семантических соседей.
- **Отчет о здоровье хранилища (Health Reports):** Генерация сводки по рабочему пространству (поиск заметок-сирот, пустых хабов и сломанных метаданных).

---

## ⚙️ Установка

### Вариант А: Ручная установка (Рекомендуется)
1. Скачайте `main.js`, `manifest.json` и `styles.css` из последнего [Релиза](https://github.com/pradigmaz/knowledge-obsidian-plugin/releases).
2. Создайте папку `knowledge` внутри вашей директории `.obsidian/plugins/`.
3. Поместите скачанные файлы в эту папку.
4. Перезапустите Obsidian и включите **Knowledge Analytics** в Community Plugins.

### Вариант Б: Установка через BRAT (Для тестирования)
1. Установите [BRAT](https://github.com/TfTHacker/obsidian42-brat) из списка Community Plugins.
2. Добавьте `pradigmaz/knowledge-obsidian-plugin` в список репозиториев BRAT.
3. Включите **Knowledge Analytics** в Community Plugins.

---

## 🚀 Использование

Плагин работает полностью в фоновом режиме на порту `27125`. Он отвечает на внутренние REST API запросы от `obsidian-mcp-server`. Никакого графического интерфейса или взаимодействия через командную палитру (Command Palette) не требуется.

---

## 📄 Лицензия

Проект распространяется по лицензии MIT — подробности в файле [LICENSE](LICENSE).
