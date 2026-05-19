/** 当前刺激集格式版本 */
export const STIMULUS_SET_SCHEMA_VERSION = 2 as const;
/** 旧版仅含 blocks，导入时自动迁移 */
export const STIMULUS_SET_SCHEMA_VERSION_LEGACY = 1 as const;

export type StimulusUnitType = "textDisplay" | "textControl" | "imageDisplay" | "imageControl";

export interface TextDisplayUnit {
  id: string;
  type: "textDisplay";
  /** 基础 Markdown（运行页解析） */
  text: string;
  durationMs: number;
}

export interface TextControlUnit {
  id: string;
  type: "textControl";
  /** 基础 Markdown（运行页解析） */
  text: string;
  /** jsPsych 键盘码，如空格为 `" "` */
  key: string;
}

/** 使用 data URL（Base64）嵌入 JSON，便于导入导出与离线运行 */
export interface ImageDisplayUnit {
  id: string;
  type: "imageDisplay";
  imageDataUrl: string;
  /** 呈现时间（毫秒） */
  durationMs: number;
}

export interface ImageControlUnit {
  id: string;
  type: "imageControl";
  imageDataUrl: string;
  /** 结束按键，默认空格 */
  key: string;
}

export type StimulusUnit = TextDisplayUnit | TextControlUnit | ImageDisplayUnit | ImageControlUnit;

export interface Trial {
  id: string;
  units: StimulusUnit[];
}

/** 顶层：Block，内含 Trial → 单元 */
export interface BlockSegment {
  kind: "block";
  id: string;
  trials: Trial[];
}

/** 顶层：休息，无 Trial，仅单元列表 */
export interface RestSegment {
  kind: "rest";
  id: string;
  units: StimulusUnit[];
}

export type TopLevelSequenceItem = BlockSegment | RestSegment;

export interface ExperimentStimulusSet {
  schemaVersion: typeof STIMULUS_SET_SCHEMA_VERSION;
  /** 顶层顺序：Block 与 休息 可任意穿插 */
  sequence: TopLevelSequenceItem[];
}
