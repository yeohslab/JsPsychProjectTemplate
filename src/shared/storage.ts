import {
  STIMULUS_SET_SCHEMA_VERSION,
  STIMULUS_SET_SCHEMA_VERSION_LEGACY,
  type BlockSegment,
  type ExperimentStimulusSet,
  type RestSegment,
  type StimulusUnit,
  type TopLevelSequenceItem,
  type Trial,
} from "../types/experiment";
import { newId } from "./ids";
import { sanitizeImageDataUrl } from "./html";

export const SESSION_STIMULUS_KEY = "jspsych-stimulus-set-for-run";
export const LOCAL_DRAFT_KEY = "jspsych-stimulus-draft";

export function createDefaultStimulusSet(): ExperimentStimulusSet {
  const unit: StimulusUnit = {
    id: newId(),
    type: "textDisplay",
    text: "示例：**文本显示** 单元（支持基础 Markdown）",
    durationMs: 1000,
  };
  const trial: Trial = { id: newId(), units: [unit] };
  const block: BlockSegment = { kind: "block", id: newId(), trials: [trial] };
  return { schemaVersion: STIMULUS_SET_SCHEMA_VERSION, sequence: [block] };
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function parseUnit(raw: unknown): StimulusUnit | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id : newId();
  const type = raw.type;
  if (type === "textDisplay") {
    const text = typeof raw.text === "string" ? raw.text : "";
    const durationMs =
      typeof raw.durationMs === "number" && Number.isFinite(raw.durationMs)
        ? Math.round(raw.durationMs)
        : 1000;
    return { id, type: "textDisplay", text, durationMs };
  }
  if (type === "textControl") {
    const text = typeof raw.text === "string" ? raw.text : "";
    const key = typeof raw.key === "string" ? raw.key : " ";
    return { id, type: "textControl", text, key };
  }
  if (type === "imageDisplay") {
    const rawUrl = typeof raw.imageDataUrl === "string" ? raw.imageDataUrl : "";
    const imageDataUrl = sanitizeImageDataUrl(rawUrl) ?? "";
    const durationMs =
      typeof raw.durationMs === "number" && Number.isFinite(raw.durationMs)
        ? Math.round(raw.durationMs)
        : 1000;
    return { id, type: "imageDisplay", imageDataUrl, durationMs };
  }
  if (type === "imageControl") {
    const rawUrl = typeof raw.imageDataUrl === "string" ? raw.imageDataUrl : "";
    const imageDataUrl = sanitizeImageDataUrl(rawUrl) ?? "";
    const key = typeof raw.key === "string" ? raw.key : " ";
    return { id, type: "imageControl", imageDataUrl, key };
  }
  return null;
}

function parseTrial(raw: unknown): Trial | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id : newId();
  if (!Array.isArray(raw.units)) return null;
  const units: StimulusUnit[] = [];
  for (const u of raw.units) {
    const parsed = parseUnit(u);
    if (parsed) units.push(parsed);
  }
  return { id, units };
}

function parseBlockSegment(raw: unknown): BlockSegment | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id : newId();
  if (!Array.isArray(raw.trials)) return null;
  const trials: Trial[] = [];
  for (const t of raw.trials) {
    const parsed = parseTrial(t);
    if (parsed) trials.push(parsed);
  }
  return { kind: "block", id, trials };
}

function parseRestSegment(raw: unknown): RestSegment | null {
  if (!isRecord(raw)) return null;
  if (raw.kind !== "rest") return null;
  const id = typeof raw.id === "string" ? raw.id : newId();
  if (!Array.isArray(raw.units)) return null;
  const units: StimulusUnit[] = [];
  for (const u of raw.units) {
    const parsed = parseUnit(u);
    if (parsed) units.push(parsed);
  }
  return { kind: "rest", id, units };
}

function parseSequenceItem(raw: unknown): TopLevelSequenceItem | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === "rest") return parseRestSegment(raw);
  if (raw.kind === "block") return parseBlockSegment(raw);
  if (raw.kind === undefined && Array.isArray((raw as { trials?: unknown }).trials)) {
    return parseBlockSegment({ ...raw, kind: "block" });
  }
  return null;
}

function migrateV1ToV2(raw: Record<string, unknown>): ExperimentStimulusSet | null {
  if (!Array.isArray(raw.blocks)) return null;
  const sequence: TopLevelSequenceItem[] = [];
  for (const b of raw.blocks) {
    const parsed = parseBlockSegment({ ...(b as object), kind: "block" });
    if (parsed) sequence.push(parsed);
  }
  if (sequence.length === 0) return null;
  return { schemaVersion: STIMULUS_SET_SCHEMA_VERSION, sequence };
}

export function parseExperimentStimulusSet(raw: unknown): ExperimentStimulusSet | null {
  if (!isRecord(raw)) return null;

  if (raw.schemaVersion === STIMULUS_SET_SCHEMA_VERSION_LEGACY) {
    return migrateV1ToV2(raw);
  }

  if (raw.schemaVersion !== STIMULUS_SET_SCHEMA_VERSION) return null;
  if (!Array.isArray(raw.sequence)) return null;

  const sequence: TopLevelSequenceItem[] = [];
  for (const item of raw.sequence) {
    const parsed = parseSequenceItem(item);
    if (parsed) sequence.push(parsed);
  }
  if (sequence.length === 0) return null;
  return { schemaVersion: STIMULUS_SET_SCHEMA_VERSION, sequence };
}

export function saveStimulusSetToSession(set: ExperimentStimulusSet): void {
  sessionStorage.setItem(SESSION_STIMULUS_KEY, JSON.stringify(set));
}

export function loadStimulusSetFromSession(): ExperimentStimulusSet | null {
  const s = sessionStorage.getItem(SESSION_STIMULUS_KEY);
  if (!s) return null;
  try {
    return parseExperimentStimulusSet(JSON.parse(s) as unknown);
  } catch {
    return null;
  }
}

export function loadDraftFromLocal(): ExperimentStimulusSet | null {
  const s = localStorage.getItem(LOCAL_DRAFT_KEY);
  if (!s) return null;
  try {
    return parseExperimentStimulusSet(JSON.parse(s) as unknown);
  } catch {
    return null;
  }
}

export function saveDraftToLocal(set: ExperimentStimulusSet): void {
  localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(set));
}

function segmentLabel(si: number, item: TopLevelSequenceItem): string {
  return item.kind === "block" ? `第 ${si + 1} 段（Block）` : `第 ${si + 1} 段（休息）`;
}

export function validateRunnableSet(set: ExperimentStimulusSet): string | null {
  if (set.sequence.length === 0) return "请至少添加一段结构（Block 或 休息）。";
  for (let si = 0; si < set.sequence.length; si++) {
    const item = set.sequence[si];
    const lab = segmentLabel(si, item);
    if (item.kind === "block") {
      if (item.trials.length === 0) return `${lab} 中没有任何 Trial。`;
      for (let ti = 0; ti < item.trials.length; ti++) {
        const t = item.trials[ti];
        if (t.units.length === 0) return `${lab} 的 Trial ${ti + 1} 没有任何刺激单元。`;
      }
    } else {
      if (item.units.length === 0) return `${lab} 中没有任何刺激单元。`;
    }
  }
  return null;
}

export function validateDesignWarnings(set: ExperimentStimulusSet): string[] {
  const warnings: string[] = [];
  set.sequence.forEach((item, si) => {
    const lab = segmentLabel(si, item);
    if (item.kind === "block") {
      item.trials.forEach((t, ti) => {
        t.units.forEach((u, ui) => {
          const loc = `${lab} Trial ${ti + 1} 单元 ${ui + 1}`;
          pushUnitWarnings(warnings, loc, u);
        });
      });
    } else {
      item.units.forEach((u, ui) => {
        const loc = `${lab} 单元 ${ui + 1}`;
        pushUnitWarnings(warnings, loc, u);
      });
    }
  });
  return warnings;
}

function pushUnitWarnings(warnings: string[], loc: string, u: StimulusUnit): void {
  if (u.type === "textDisplay" || u.type === "textControl") {
    if (!u.text.trim()) {
      warnings.push(`${loc}：文本为空。`);
    }
  }
  if (u.type === "textDisplay" && u.durationMs <= 0) {
    warnings.push(`${loc}：显示时间应大于 0 ms。`);
  }
  if (u.type === "imageDisplay" && u.durationMs <= 0) {
    warnings.push(`${loc}：呈现时间应大于 0 ms。`);
  }
  if (u.type === "imageDisplay" || u.type === "imageControl") {
    if (!sanitizeImageDataUrl(u.imageDataUrl)) {
      warnings.push(`${loc}：请上传有效图片（PNG / JPEG / GIF / WebP）。`);
    }
  }
}
