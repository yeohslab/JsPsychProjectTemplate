import type {
  BlockSegment,
  ExperimentStimulusSet,
  RestSegment,
  StimulusUnit,
  TopLevelSequenceItem,
  Trial,
} from "../types/experiment";
import { sanitizeImageDataUrl } from "../shared/html";
import { newId } from "../shared/ids";
import { KEY_CHOICE_OPTIONS } from "../shared/keys";
import {
  createDefaultStimulusSet,
  loadDraftFromLocal,
  parseExperimentStimulusSet,
  saveDraftToLocal,
  saveStimulusSetToSession,
  validateDesignWarnings,
  validateRunnableSet,
} from "../shared/storage";
import { bindSortable } from "./sortable";

interface EditorState {
  set: ExperimentStimulusSet;
  selectedSegmentId: string;
  selectedTrialId: string;
  selectedUnitId: string | null;
  banner: string | null;
}

let state: EditorState;
let draftTimer: ReturnType<typeof setTimeout> | undefined;
let sortables: Array<ReturnType<typeof bindSortable>> = [];

function scheduleDraftSave(): void {
  window.clearTimeout(draftTimer);
  draftTimer = window.setTimeout(() => {
    saveDraftToLocal(state.set);
    draftTimer = undefined;
  }, 400);
}

function getSegment(id: string): TopLevelSequenceItem | undefined {
  return state.set.sequence.find((s) => s.id === id);
}

function getBlockSegment(id: string): BlockSegment | undefined {
  const s = getSegment(id);
  return s?.kind === "block" ? s : undefined;
}

function getTrial(block: BlockSegment, trialId: string): Trial | undefined {
  return block.trials.find((t) => t.id === trialId);
}

function ensureSelection(): void {
  if (state.set.sequence.length === 0) return;
  let seg = getSegment(state.selectedSegmentId);
  if (!seg) {
    seg = state.set.sequence[0]!;
    state.selectedSegmentId = seg.id;
  }
  if (seg.kind === "block") {
    let t = getTrial(seg, state.selectedTrialId);
    if (!t) {
      t = seg.trials[0];
      state.selectedTrialId = t?.id ?? "";
    }
    if (!t) {
      state.selectedTrialId = "";
      state.selectedUnitId = null;
      return;
    }
    if (state.selectedUnitId && !t.units.some((u) => u.id === state.selectedUnitId)) {
      state.selectedUnitId = t.units[0]?.id ?? null;
    }
  } else {
    state.selectedTrialId = "";
    if (state.selectedUnitId && !seg.units.some((u) => u.id === state.selectedUnitId)) {
      state.selectedUnitId = seg.units[0]?.id ?? null;
    }
  }
}

function reorderByIds<T extends { id: string }>(items: T[], orderedIds: string[]): void {
  const map = new Map(items.map((x) => [x.id, x]));
  const next: T[] = [];
  for (const id of orderedIds) {
    const x = map.get(id);
    if (x) next.push(x);
  }
  for (const x of items) {
    if (!orderedIds.includes(x.id)) next.push(x);
  }
  items.length = 0;
  items.push(...next);
}

function renderStructureTree(container: HTMLElement): void {
  container.innerHTML = "";
  const ulSeq = document.createElement("ul");
  ulSeq.id = "tree-list-sequence";
  ulSeq.className = "tree-list tree-list--sequence";

  state.set.sequence.forEach((item, si) => {
    if (item.kind === "block") {
      appendBlockBranch(ulSeq, item, si);
    } else {
      appendRestBranch(ulSeq, item, si);
    }
  });

  sortables.push(
    bindSortable(ulSeq, (ids) => {
      reorderByIds(state.set.sequence, ids);
      scheduleDraftSave();
      render();
    }),
  );

  container.appendChild(ulSeq);
}

function appendBlockBranch(ulSeq: HTMLElement, b: BlockSegment, si: number): void {
  const liB = document.createElement("li");
  liB.className = "tree-li tree-li--block";
  liB.dataset.itemId = b.id;

  const rowB = document.createElement("div");
  const segSelected = b.id === state.selectedSegmentId;
  rowB.className = `tree-row tree-row--block${segSelected ? " is-selected" : ""}`;
  rowB.innerHTML = `
      <span class="drag-handle" title="拖动排序">⠿</span>
      <span class="tree-row__main"><span class="tree-ico" aria-hidden="true">▣</span> ${si + 1}. Block</span>
      <span class="muted tree-row__count">${b.trials.length} Trial</span>
      <span class="tree-row__actions">
        <button type="button" class="btn btn-sm" data-action="add-trial" data-segment-id="${b.id}">＋ Trial</button>
        <button type="button" class="btn btn-icon btn-danger" data-action="del-segment" data-id="${b.id}" title="删除本段">✕</button>
      </span>`;
  rowB.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("button")) return;
    state.selectedSegmentId = b.id;
    state.selectedTrialId = b.trials[0]?.id ?? "";
    state.selectedUnitId = b.trials[0]?.units[0]?.id ?? null;
    state.banner = null;
    render();
  });
  liB.appendChild(rowB);

  const ulT = document.createElement("ul");
  ulT.className = "tree-list tree-list--trials";
  ulT.dataset.segmentId = b.id;

  b.trials.forEach((t, ti) => {
    const liT = document.createElement("li");
    liT.className = "tree-li tree-li--trial";
    liT.dataset.itemId = t.id;

    const rowT = document.createElement("div");
    const trialSelected = segSelected && t.id === state.selectedTrialId;
    rowT.className = `tree-row tree-row--trial${trialSelected ? " is-selected" : ""}`;
    rowT.innerHTML = `
        <span class="drag-handle" title="拖动排序">⠿</span>
        <span class="tree-row__main"><span class="tree-ico" aria-hidden="true">◇</span> Trial ${ti + 1}</span>
        <span class="muted tree-row__count">${t.units.length} 单元</span>
        <span class="tree-row__actions">
          <button type="button" class="btn btn-icon btn-danger" data-action="del-trial" data-segment-id="${b.id}" data-trial-id="${t.id}" title="删除 Trial">✕</button>
        </span>`;
    rowT.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      state.selectedSegmentId = b.id;
      state.selectedTrialId = t.id;
      state.selectedUnitId = t.units[0]?.id ?? null;
      state.banner = null;
      render();
    });
    liT.appendChild(rowT);

    const ulU = document.createElement("ul");
    ulU.className = "tree-list tree-list--units";
    ulU.dataset.segmentId = b.id;
    ulU.dataset.trialId = t.id;

    t.units.forEach((u) => {
      const liU = document.createElement("li");
      liU.className = "tree-li tree-li--unit";
      liU.dataset.itemId = u.id;

      const rowU = document.createElement("div");
      const unitSelected = segSelected && trialSelected && u.id === state.selectedUnitId;
      rowU.className = `tree-row tree-row--unit${unitSelected ? " is-selected" : ""}`;
      rowU.innerHTML = `
          <span class="drag-handle" title="拖动排序">⠿</span>
          <span class="tree-row__main"><span class="tree-ico" aria-hidden="true">·</span> ${unitTypeLabel(u)}</span>
          <span class="muted tree-row__preview">${escapeHtml(unitListPreview(u))}</span>
          <span class="tree-row__actions">
            <button type="button" class="btn btn-icon btn-danger" data-action="del-unit" data-segment-id="${b.id}" data-trial-id="${t.id}" data-id="${u.id}" title="删除单元">✕</button>
          </span>`;
      rowU.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        state.selectedSegmentId = b.id;
        state.selectedTrialId = t.id;
        state.selectedUnitId = u.id;
        state.banner = null;
        render();
      });
      liU.appendChild(rowU);
      ulU.appendChild(liU);
    });

    liT.appendChild(ulU);
    ulT.appendChild(liT);

    sortables.push(
      bindSortable(ulU, (ids) => {
        reorderByIds(t.units, ids);
        scheduleDraftSave();
        render();
      }),
    );
  });

  liB.appendChild(ulT);
  ulSeq.appendChild(liB);

  sortables.push(
    bindSortable(ulT, (ids) => {
      reorderByIds(b.trials, ids);
      scheduleDraftSave();
      render();
    }),
  );
}

function appendRestBranch(ulSeq: HTMLElement, r: RestSegment, si: number): void {
  const liR = document.createElement("li");
  liR.className = "tree-li tree-li--rest";
  liR.dataset.itemId = r.id;

  const rowR = document.createElement("div");
  const segSelected = r.id === state.selectedSegmentId;
  rowR.className = `tree-row tree-row--rest${segSelected ? " is-selected" : ""}`;
  rowR.innerHTML = `
      <span class="drag-handle" title="拖动排序">⠿</span>
      <span class="tree-row__main"><span class="tree-ico" aria-hidden="true">☕</span> ${si + 1}. 休息</span>
      <span class="muted tree-row__count">${r.units.length} 单元</span>
      <span class="tree-row__actions">
        <button type="button" class="btn btn-icon btn-danger" data-action="del-segment" data-id="${r.id}" title="删除本段">✕</button>
      </span>`;
  rowR.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("button")) return;
    state.selectedSegmentId = r.id;
    state.selectedTrialId = "";
    state.selectedUnitId = r.units[0]?.id ?? null;
    state.banner = null;
    render();
  });
  liR.appendChild(rowR);

  const ulU = document.createElement("ul");
  ulU.className = "tree-list tree-list--units";
  ulU.dataset.segmentId = r.id;

  r.units.forEach((u) => {
    const liU = document.createElement("li");
    liU.className = "tree-li tree-li--unit";
    liU.dataset.itemId = u.id;

    const rowU = document.createElement("div");
    const unitSelected = segSelected && u.id === state.selectedUnitId;
    rowU.className = `tree-row tree-row--unit${unitSelected ? " is-selected" : ""}`;
    rowU.innerHTML = `
        <span class="drag-handle" title="拖动排序">⠿</span>
        <span class="tree-row__main"><span class="tree-ico" aria-hidden="true">·</span> ${unitTypeLabel(u)}</span>
        <span class="muted tree-row__preview">${escapeHtml(unitListPreview(u))}</span>
        <span class="tree-row__actions">
          <button type="button" class="btn btn-icon btn-danger" data-action="del-unit" data-segment-id="${r.id}" data-id="${u.id}" title="删除单元">✕</button>
        </span>`;
    rowU.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      state.selectedSegmentId = r.id;
      state.selectedTrialId = "";
      state.selectedUnitId = u.id;
      state.banner = null;
      render();
    });
    liU.appendChild(rowU);
    ulU.appendChild(liU);
  });

  liR.appendChild(ulU);
  ulSeq.appendChild(liR);

  sortables.push(
    bindSortable(ulU, (ids) => {
      reorderByIds(r.units, ids);
      scheduleDraftSave();
      render();
    }),
  );
}

function wireTreeAddTrial(root: HTMLElement): void {
  root.querySelectorAll('[data-action="add-trial"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const sid = (btn as HTMLElement).dataset.segmentId;
      const b = sid ? getBlockSegment(sid) : undefined;
      if (!b) return;
      const unit: StimulusUnit = {
        id: newId(),
        type: "textDisplay",
        text: "新文本显示",
        durationMs: 1000,
      };
      const trial: Trial = { id: newId(), units: [unit] };
      b.trials.push(trial);
      state.selectedSegmentId = b.id;
      state.selectedTrialId = trial.id;
      state.selectedUnitId = unit.id;
      scheduleDraftSave();
      render();
    });
  });
}

function render(): void {
  sortables.forEach((s) => s.destroy());
  sortables = [];

  const root = document.getElementById("editor-root");
  if (!root) return;

  ensureSelection();
  const seg = getSegment(state.selectedSegmentId);
  const block = seg?.kind === "block" ? seg : undefined;
  const rest = seg?.kind === "rest" ? seg : undefined;
  const trial = block ? getTrial(block, state.selectedTrialId) : undefined;
  const unitList: StimulusUnit[] | undefined = trial?.units ?? rest?.units;

  root.innerHTML = `
    <header class="editor-header">
      <div class="editor-header__title">
        <h1>刺激编写</h1>
        <p class="muted">左侧树：Block（含 Trial→单元）与「休息」（仅单元）可穿插排列；右侧编辑选中单元。</p>
      </div>
      <div class="editor-header__actions">
        <a class="btn btn-ghost" href="#/runner">运行页</a>
        <button type="button" class="btn btn-primary" id="btn-run">运行实验</button>
        <button type="button" class="btn btn-secondary" id="btn-export">导出 JSON</button>
        <button type="button" class="btn btn-secondary" id="btn-import">导入 JSON</button>
        <input type="file" id="input-import" accept=".json,application/json" hidden />
      </div>
    </header>
    <div id="editor-banner" class="banner ${state.banner ? "banner--visible" : ""}" role="status">
      ${state.banner ? escapeHtml(state.banner) : ""}
    </div>
    <div class="editor-body">
      <aside class="panel panel-tree">
        <div class="panel__head">
          <h2>实验结构</h2>
          <button type="button" class="btn btn-sm" id="btn-add-block">添加 Block</button>
          <button type="button" class="btn btn-sm" id="btn-add-rest">添加 休息</button>
        </div>
        <div id="tree-root" class="tree-root"></div>
      </aside>
      <section class="panel panel-editor">
        <div class="panel__head">
          <h2>单元属性</h2>
          <div class="panel__head-actions">
            <button type="button" class="btn btn-sm" id="btn-add-display" ${trial || rest ? "" : "disabled"}>＋ 文本显示</button>
            <button type="button" class="btn btn-sm" id="btn-add-control" ${trial || rest ? "" : "disabled"}>＋ 文本控制</button>
            <button type="button" class="btn btn-sm" id="btn-add-image-display" ${trial || rest ? "" : "disabled"}>＋ 图像显示</button>
            <button type="button" class="btn btn-sm" id="btn-add-image-control" ${trial || rest ? "" : "disabled"}>＋ 图像控制</button>
          </div>
        </div>
        <div id="unit-editor" class="unit-editor"></div>
      </section>
    </div>
  `;

  const treeRoot = root.querySelector("#tree-root") as HTMLElement;
  renderStructureTree(treeRoot);

  const unitEditor = root.querySelector("#unit-editor") as HTMLElement;
  if (unitList) {
    const sel = unitList.find((u) => u.id === state.selectedUnitId);
    if (sel) {
      unitEditor.innerHTML = renderUnitForm(sel);
      wireUnitForm(unitEditor, unitList, sel);
    } else {
      unitEditor.innerHTML = `<p class="muted">当前位置下还没有刺激单元，请使用上方「＋」按钮添加。</p>`;
    }
  } else {
    unitEditor.innerHTML = `<p class="muted">请先在左侧选择 Block 下的 Trial（或选择一段「休息」）。</p>`;
  }

  wireHeader(root);
  wireTreeAddTrial(root);
  wireDeleteButtons(root);
}

function previewText(s: string, max = 36): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t || "（空）";
  return `${t.slice(0, max)}…`;
}

function unitTypeLabel(u: StimulusUnit): string {
  switch (u.type) {
    case "textDisplay":
      return "文本显示";
    case "textControl":
      return "文本控制";
    case "imageDisplay":
      return "图像显示";
    case "imageControl":
      return "图像控制";
  }
}

function unitListPreview(u: StimulusUnit): string {
  if (u.type === "textDisplay" || u.type === "textControl") {
    return previewText(u.text);
  }
  return u.imageDataUrl ? "已上传图片" : "未上传图片";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderUnitForm(u: StimulusUnit): string {
  if (u.type === "textDisplay") {
    return `
      <h3>编辑：文本显示</h3>
      <div class="unit-form">
        <div class="unit-form__block">
          <label class="unit-form__label" for="f-text">文本内容（Markdown）</label>
          <p class="hint muted unit-form__hint">运行页解析渲染。支持标题、**粗体**、*斜体*、列表、行内代码、链接（仅 http/https）等；引用与表格等会被忽略。</p>
          <textarea id="f-text" class="unit-form__textarea" rows="7">${escapeHtml(u.text)}</textarea>
        </div>
        <div class="unit-form__row">
          <label class="unit-form__row-label" for="f-duration">显示时间 (ms)</label>
          <input type="number" id="f-duration" class="unit-form__number" min="1" step="1" value="${u.durationMs}" />
        </div>
      </div>
      <button type="button" class="btn btn-danger" id="f-del-unit">删除此单元</button>
    `;
  }
  if (u.type === "textControl") {
    const keyOptions = KEY_CHOICE_OPTIONS.map(
      (o) =>
        `<option value="${escapeHtml(o.value)}" ${u.key === o.value ? "selected" : ""}>${escapeHtml(o.label)}</option>`,
    ).join("");
    const customSelected = !KEY_CHOICE_OPTIONS.some((o) => o.value === u.key) ? "selected" : "";
    return `
      <h3>编辑：文本控制</h3>
      <div class="unit-form">
        <div class="unit-form__block">
          <label class="unit-form__label" for="f-text">文本内容（Markdown）</label>
          <p class="hint muted unit-form__hint">运行页解析渲染；语法与「文本显示」单元相同。</p>
          <textarea id="f-text" class="unit-form__textarea" rows="7">${escapeHtml(u.text)}</textarea>
        </div>
        <div class="unit-form__block unit-form__block--tight">
          <label class="unit-form__label" for="f-key-preset">结束按键</label>
          <div class="key-row">
            <select id="f-key-preset">
              ${keyOptions}
              <option value="__custom__" ${customSelected}>自定义…</option>
            </select>
            <input type="text" id="f-key-custom" maxlength="20" placeholder="单键或如 ArrowLeft" class="${customSelected ? "" : "is-hidden"}" value="${customSelected ? escapeHtml(u.key) : ""}" />
          </div>
          <p class="hint muted unit-form__hint">默认空格：预设中选「空格」，或在自定义中输入一个空格字符。</p>
        </div>
      </div>
      <button type="button" class="btn btn-danger" id="f-del-unit">删除此单元</button>
    `;
  }
  if (u.type === "imageDisplay") {
    const hasImg = Boolean(u.imageDataUrl);
    const srcAttr = hasImg ? ` src="${escapeHtml(u.imageDataUrl)}"` : "";
    return `
      <h3>编辑：图像显示</h3>
      <div class="form-grid">
        <label>图片</label>
        <div class="image-field">
          <input type="file" id="f-image-file" accept="image/png,image/jpeg,image/jpg,image/gif,image/webp" />
          <p class="hint muted">支持 PNG / JPEG / GIF / WebP，建议单张小于 6MB（将嵌入 JSON）。</p>
          <img id="f-image-preview" class="unit-image-preview" alt="预览"${hasImg ? srcAttr : " hidden"} />
        </div>
        <label>呈现时间 (ms)</label>
        <input type="number" id="f-duration" min="1" step="1" value="${u.durationMs}" />
      </div>
      <button type="button" class="btn btn-danger" id="f-del-unit">删除此单元</button>
    `;
  }
  const keyOptions = KEY_CHOICE_OPTIONS.map(
    (o) =>
      `<option value="${escapeHtml(o.value)}" ${u.key === o.value ? "selected" : ""}>${escapeHtml(o.label)}</option>`,
  ).join("");
  const customSelected = !KEY_CHOICE_OPTIONS.some((o) => o.value === u.key) ? "selected" : "";
  const hasImg = Boolean(u.imageDataUrl);
  const srcAttr = hasImg ? ` src="${escapeHtml(u.imageDataUrl)}"` : "";
  return `
    <h3>编辑：图像控制</h3>
    <div class="form-grid">
      <label>图片</label>
      <div class="image-field">
        <input type="file" id="f-image-file" accept="image/png,image/jpeg,image/jpg,image/gif,image/webp" />
        <p class="hint muted">呈现图片直到按下结束键；默认空格结束。</p>
        <img id="f-image-preview" class="unit-image-preview" alt="预览"${hasImg ? srcAttr : " hidden"} />
      </div>
      <label>结束按键</label>
      <div class="key-row">
        <select id="f-key-preset">
          ${keyOptions}
          <option value="__custom__" ${customSelected}>自定义…</option>
        </select>
        <input type="text" id="f-key-custom" maxlength="20" placeholder="单键或如 ArrowLeft" class="${customSelected ? "" : "is-hidden"}" value="${customSelected ? escapeHtml(u.key) : ""}" />
      </div>
    </div>
    <button type="button" class="btn btn-danger" id="f-del-unit">删除此单元</button>
  `;
}

const IMAGE_MAX_FILE_BYTES = 6 * 1024 * 1024;

function wireUnitForm(container: HTMLElement, unitList: StimulusUnit[], u: StimulusUnit): void {
  const delBtn = container.querySelector("#f-del-unit");
  delBtn?.addEventListener("click", () => {
    if (!confirm("确定删除该刺激单元？")) return;
    const next = unitList.filter((x) => x.id !== u.id);
    unitList.length = 0;
    unitList.push(...next);
    state.selectedUnitId = unitList[0]?.id ?? null;
    scheduleDraftSave();
    render();
  });

  if (u.type === "textDisplay") {
    const textEl = container.querySelector("#f-text") as HTMLTextAreaElement;
    const apply = () => {
      u.text = textEl.value;
      const d = container.querySelector("#f-duration") as HTMLInputElement;
      const dm = Number(d.value);
      u.durationMs = Number.isFinite(dm) ? Math.round(dm) : 1000;
      scheduleDraftSave();
    };
    textEl.addEventListener("input", apply);
    container.querySelector("#f-duration")?.addEventListener("input", apply);
    return;
  }

  if (u.type === "textControl") {
    const textEl = container.querySelector("#f-text") as HTMLTextAreaElement;
    const preset = container.querySelector("#f-key-preset") as HTMLSelectElement;
    const custom = container.querySelector("#f-key-custom") as HTMLInputElement;
    const apply = () => {
      u.text = textEl.value;
      if (preset.value === "__custom__") {
        u.key = custom.value || " ";
      } else {
        u.key = preset.value ?? " ";
      }
      scheduleDraftSave();
    };
    textEl.addEventListener("input", apply);
    preset.addEventListener("change", () => {
      if (preset.value === "__custom__") {
        custom.classList.remove("is-hidden");
      } else {
        custom.classList.add("is-hidden");
      }
      apply();
    });
    custom.addEventListener("input", apply);
    return;
  }

  const fileInput = container.querySelector("#f-image-file") as HTMLInputElement | null;
  const preview = container.querySelector("#f-image-preview") as HTMLImageElement | null;
  fileInput?.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    if (f.size > IMAGE_MAX_FILE_BYTES) {
      alert("图片文件过大，请选择小于 6 MB 的图片。");
      fileInput.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      const safe = sanitizeImageDataUrl(url);
      if (!safe) {
        alert("无法使用该图片，请使用 PNG、JPEG、GIF 或 WebP。");
        fileInput.value = "";
        return;
      }
      u.imageDataUrl = safe;
      if (preview) {
        preview.src = safe;
        preview.hidden = false;
      }
      scheduleDraftSave();
      render();
    };
    reader.readAsDataURL(f);
  });

  if (u.type === "imageDisplay") {
    const applyDuration = () => {
      const d = container.querySelector("#f-duration") as HTMLInputElement;
      const dm = Number(d.value);
      u.durationMs = Number.isFinite(dm) ? Math.round(dm) : 1000;
      scheduleDraftSave();
    };
    container.querySelector("#f-duration")?.addEventListener("input", applyDuration);
    return;
  }

  const preset = container.querySelector("#f-key-preset") as HTMLSelectElement;
  const custom = container.querySelector("#f-key-custom") as HTMLInputElement;
  const applyKey = () => {
    if (preset.value === "__custom__") {
      u.key = custom.value || " ";
    } else {
      u.key = preset.value ?? " ";
    }
    scheduleDraftSave();
  };
  preset.addEventListener("change", () => {
    if (preset.value === "__custom__") {
      custom.classList.remove("is-hidden");
    } else {
      custom.classList.add("is-hidden");
    }
    applyKey();
  });
  custom.addEventListener("input", applyKey);
}

function pushNewUnitToSelection(unit: StimulusUnit): void {
  const seg = getSegment(state.selectedSegmentId);
  if (seg?.kind === "block") {
    const tr = getTrial(seg, state.selectedTrialId);
    if (!tr) return;
    tr.units.push(unit);
  } else if (seg?.kind === "rest") {
    seg.units.push(unit);
  } else {
    return;
  }
  state.selectedUnitId = unit.id;
  scheduleDraftSave();
  render();
}

function applyFirstSelectionFromSet(set: ExperimentStimulusSet): void {
  const s0 = set.sequence[0];
  if (!s0) {
    state.selectedSegmentId = "";
    state.selectedTrialId = "";
    state.selectedUnitId = null;
    return;
  }
  state.selectedSegmentId = s0.id;
  if (s0.kind === "block") {
    state.selectedTrialId = s0.trials[0]?.id ?? "";
    state.selectedUnitId = s0.trials[0]?.units[0]?.id ?? null;
  } else {
    state.selectedTrialId = "";
    state.selectedUnitId = s0.units[0]?.id ?? null;
  }
}

function wireHeader(root: HTMLElement): void {
  root.querySelector("#btn-run")?.addEventListener("click", () => {
    const runErr = validateRunnableSet(state.set);
    if (runErr) {
      state.banner = runErr;
      render();
      return;
    }
    const warns = validateDesignWarnings(state.set);
    if (warns.length > 0) {
      const ok = confirm(`${warns.join("\n")}\n\n仍要继续运行吗？`);
      if (!ok) return;
    }
    saveStimulusSetToSession(state.set);
    state.banner = null;
    location.hash = "#/runner";
  });

  root.querySelector("#btn-export")?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state.set, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "experiment-stimulus.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  const fileInput = root.querySelector("#input-import") as HTMLInputElement;
  root.querySelector("#btn-import")?.addEventListener("click", () => {
    fileInput.value = "";
    fileInput.click();
  });
  fileInput?.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseExperimentStimulusSet(JSON.parse(String(reader.result)) as unknown);
        if (!parsed) {
          alert("无法导入：JSON 无效、或 schemaVersion 不为 1/2、或 sequence/blocks 为空。");
          return;
        }
        if (!confirm("导入将覆盖当前设计（含草稿）。确定继续？")) return;
        state.set = parsed;
        applyFirstSelectionFromSet(parsed);
        state.banner = null;
        saveDraftToLocal(state.set);
        render();
      } catch {
        alert("JSON 解析失败。");
      }
    };
    reader.readAsText(f, "UTF-8");
  });

  root.querySelector("#btn-add-block")?.addEventListener("click", () => {
    const unit: StimulusUnit = {
      id: newId(),
      type: "textDisplay",
      text: "新文本显示",
      durationMs: 1000,
    };
    const trial: Trial = { id: newId(), units: [unit] };
    const block: BlockSegment = { kind: "block", id: newId(), trials: [trial] };
    state.set.sequence.push(block);
    state.selectedSegmentId = block.id;
    state.selectedTrialId = trial.id;
    state.selectedUnitId = unit.id;
    scheduleDraftSave();
    render();
  });

  root.querySelector("#btn-add-rest")?.addEventListener("click", () => {
    const unit: StimulusUnit = {
      id: newId(),
      type: "textDisplay",
      text: "休息中…",
      durationMs: 1000,
    };
    const rest: RestSegment = { kind: "rest", id: newId(), units: [unit] };
    state.set.sequence.push(rest);
    state.selectedSegmentId = rest.id;
    state.selectedTrialId = "";
    state.selectedUnitId = unit.id;
    scheduleDraftSave();
    render();
  });

  root.querySelector("#btn-add-display")?.addEventListener("click", () => {
    const unit: StimulusUnit = {
      id: newId(),
      type: "textDisplay",
      text: "新文本显示",
      durationMs: 1000,
    };
    pushNewUnitToSelection(unit);
  });

  root.querySelector("#btn-add-control")?.addEventListener("click", () => {
    const unit: StimulusUnit = {
      id: newId(),
      type: "textControl",
      text: "请按指定键继续",
      key: " ",
    };
    pushNewUnitToSelection(unit);
  });

  root.querySelector("#btn-add-image-display")?.addEventListener("click", () => {
    const unit: StimulusUnit = {
      id: newId(),
      type: "imageDisplay",
      imageDataUrl: "",
      durationMs: 1000,
    };
    pushNewUnitToSelection(unit);
  });

  root.querySelector("#btn-add-image-control")?.addEventListener("click", () => {
    const unit: StimulusUnit = {
      id: newId(),
      type: "imageControl",
      imageDataUrl: "",
      key: " ",
    };
    pushNewUnitToSelection(unit);
  });
}

function wireDeleteButtons(root: HTMLElement): void {
  root.querySelectorAll("[data-action='del-segment']").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.id;
      if (!id) return;
      if (state.set.sequence.length <= 1) {
        alert("至少保留一段结构（Block 或 休息）。");
        return;
      }
      if (!confirm("确定删除该段及其全部内容？")) return;
      state.set.sequence = state.set.sequence.filter((s) => s.id !== id);
      ensureSelection();
      scheduleDraftSave();
      render();
    });
  });
  root.querySelectorAll("[data-action='del-trial']").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const segmentId = (btn as HTMLElement).dataset.segmentId;
      const trialId = (btn as HTMLElement).dataset.trialId;
      const b = segmentId ? getBlockSegment(segmentId) : undefined;
      if (!b || !trialId) return;
      if (!confirm("确定删除该 Trial？")) return;
      b.trials = b.trials.filter((t) => t.id !== trialId);
      ensureSelection();
      scheduleDraftSave();
      render();
    });
  });
  root.querySelectorAll("[data-action='del-unit']").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const segmentId = (btn as HTMLElement).dataset.segmentId;
      const trialId = (btn as HTMLElement).dataset.trialId;
      const unitId = (btn as HTMLElement).dataset.id;
      const seg = segmentId ? getSegment(segmentId) : undefined;
      if (!seg || !unitId) return;
      if (!confirm("确定删除该单元？")) return;
      if (seg.kind === "rest") {
        seg.units = seg.units.filter((u) => u.id !== unitId);
        state.selectedSegmentId = seg.id;
        state.selectedTrialId = "";
        state.selectedUnitId = seg.units[0]?.id ?? null;
      } else {
        const tr = trialId ? getTrial(seg, trialId) : undefined;
        if (!tr) return;
        tr.units = tr.units.filter((u) => u.id !== unitId);
        state.selectedSegmentId = seg.id;
        state.selectedTrialId = tr.id;
        state.selectedUnitId = tr.units[0]?.id ?? null;
      }
      scheduleDraftSave();
      render();
    });
  });
}

export function disposeEditor(): void {
  sortables.forEach((s) => s.destroy());
  sortables = [];
  window.clearTimeout(draftTimer);
  draftTimer = undefined;
}

export function mountEditor(container: HTMLElement): void {
  disposeEditor();

  const initial = loadDraftFromLocal() ?? createDefaultStimulusSet();
  state = {
    set: initial,
    selectedSegmentId: "",
    selectedTrialId: "",
    selectedUnitId: null,
    banner: null,
  };
  applyFirstSelectionFromSet(initial);

  container.className = "editor-view";
  container.innerHTML = `<div id="editor-root"></div>`;
  render();
}
