import HtmlKeyboardResponsePlugin from "@jspsych/plugin-html-keyboard-response";
import type { BlockSegment, ExperimentStimulusSet, StimulusUnit, Trial } from "../types/experiment";
import { wrapImageStimulus, wrapStimulus } from "../shared/html";
import { normalizeKeyForJsPsych } from "../shared/keys";

export type UnitTrialContext = {
  segmentId: string;
  segmentKind: "block" | "rest";
  trialId: string | null;
};

function stimulusHtmlForUnit(unit: StimulusUnit): string {
  if (unit.type === "textDisplay" || unit.type === "textControl") {
    return wrapStimulus(unit.text);
  }
  return wrapImageStimulus(unit.imageDataUrl);
}

function unitToTrial(unit: StimulusUnit, ctx: UnitTrialContext): Record<string, unknown> {
  const stimulus = stimulusHtmlForUnit(unit);
  const data = {
    unitId: unit.id,
    unitType: unit.type,
    segmentKind: ctx.segmentKind,
    segmentId: ctx.segmentId,
    trialId: ctx.trialId ?? "",
  };
  switch (unit.type) {
    case "textDisplay":
    case "imageDisplay":
      return {
        type: HtmlKeyboardResponsePlugin,
        stimulus,
        choices: "NO_KEYS" as const,
        trial_duration: unit.durationMs,
        response_ends_trial: false,
        data,
      };
    case "textControl":
    case "imageControl": {
      const key = normalizeKeyForJsPsych(unit.key);
      return {
        type: HtmlKeyboardResponsePlugin,
        stimulus,
        choices: [key],
        response_ends_trial: true,
        data,
      };
    }
  }
}

export function buildTimeline(set: ExperimentStimulusSet): Record<string, unknown>[] {
  return set.sequence.map((item) => {
    if (item.kind === "block") {
      return buildBlockTimeline(item);
    }
    return {
      timeline: item.units.map((unit) =>
        unitToTrial(unit, { segmentKind: "rest", segmentId: item.id, trialId: null }),
      ),
    };
  });
}

function buildBlockTimeline(block: BlockSegment): Record<string, unknown> {
  return {
    timeline: block.trials.map((trial: Trial) => ({
      timeline: trial.units.map((unit) =>
        unitToTrial(unit, { segmentKind: "block", segmentId: block.id, trialId: trial.id }),
      ),
    })),
  };
}
