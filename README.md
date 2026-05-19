# JsPsych 刺激编辑与运行（静态站）

基于 [Vite](https://vitejs.dev/) 与 [jsPsych 8](https://www.jspsych.org/) 的双界面应用：

- **刺激编写**（`#/editor`）：顶层为 **顺序列表**（`sequence`），可穿插 **Block** 与 **休息**；Block 内为 Trial → 单元，**休息** 段只有单元、无 Trial；支持拖拽排序、导入/导出 JSON、本地草稿、一键进入运行。
- **运行**（`#/runner`）：从会话中读取当前设计并执行；结束后自动下载 CSV 数据。

## 环境要求

- [Node.js](https://nodejs.org/) 18+（含 `npm`）

## 命令

```bash
npm install
npm run dev
```

浏览器打开终端提示的本地地址（一般为 `http://localhost:5173`），默认进入 `#/editor`。

```bash
npm run build
```

产物在 `dist/`，可部署到任意静态托管（GitHub Pages、Nginx 等）。使用 **Hash 路由**（`#/editor`、`#/runner`），无需服务端 rewrite。

### GitHub Pages

本仓库为 Vite 项目，**不能把 `main` 根目录的源码直接当站点**（浏览器无法运行 `.ts`，且 `index.html` 里 `/src/main.ts` 在 Pages 子路径下会 404，表现为白屏）。

推荐做法（仓库已含 [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)）：

1. 将工作流推送到 `main`。
2. 打开仓库 **Settings → Pages**。
3. **Build and deployment → Source** 选 **GitHub Actions**（不要选 “Deploy from a branch” 的 `/(root)`）。
4. 等待 **Actions** 里 “Deploy to GitHub Pages” 跑绿后，访问 `https://<用户名>.github.io/JsPsychProjectTemplate/#/editor`。

`vite.config.ts` 中 `base: "./"` 已适配项目站子路径（如 `/JsPsychProjectTemplate/`）。

```bash
npm run preview
```

预览构建结果。

## 刺激集 JSON

根字段（当前为 **schemaVersion 2**）：

- `schemaVersion`：`2`
- `sequence`：顶层顺序数组，元素为以下之一：
  - **Block**：`{ "kind": "block", "id": "...", "trials": [ { "id": "...", "units": [ ... ] } ] }`
  - **休息**：`{ "kind": "rest", "id": "...", "units": [ ... ] }`（无 Trial 层，直接挂单元）

**旧版（schemaVersion 1）**：仅含 `blocks` 的 JSON 在导入时会被自动迁移为 v2（整块视为一个 `sequence` 中的 Block 列表顺序）。

每个 `trial`：`{ id, units[] }`

- 单元类型：
  - `textDisplay`：`text`（基础 Markdown，运行页解析）, `durationMs`
  - `textControl`：`text`（基础 Markdown）, `key`
  - `imageDisplay`：`imageDataUrl`（PNG/JPEG/GIF/WebP 的 Base64 data URL）, `durationMs`（呈现时间，毫秒）
  - `imageControl`：`imageDataUrl`, `key`（结束按键，默认空格 `" "`）

文本类单元在 **运行页** 由 Markdown 转为 HTML 后展示；输出经白名单消毒，**链接仅保留 `http`/`https`**；引用、表格、图片等标签会被剥离（不建议在内容中依赖这些语法）。

## 说明

- 「运行实验」会将当前刺激集写入 `sessionStorage` 后跳转到 `#/runner`。
- 编辑内容会 debounce 写入 `localStorage` 草稿键 `jspsych-stimulus-draft`。
- 若直接打开 `#/runner` 而未先运行，将提示返回编写页。

## 多个独立小项目（各自一份 `node_modules`）

若你还要在同一仓库里放**别的 JsPsych 实验**，每个实验用**独立子文件夹**，并在该文件夹内单独执行 `npm install`（依赖只装在该目录的 `node_modules`，互不共用）。

1. 在仓库根目录打开 PowerShell，执行：

   ```powershell
   .\scripts\new-jspsych-project.ps1 -Name "你的项目名"
   ```

2. 再进入新目录安装并运行：

   ```powershell
   cd .\projects\你的项目名
   npm install
   npm run dev
   ```

更详细的说明见 [projects/README.md](projects/README.md)。
