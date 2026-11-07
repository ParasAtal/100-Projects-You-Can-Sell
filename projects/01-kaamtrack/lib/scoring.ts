/**
 * Points for one task.
 *
 * ratio = actual working time (pauses removed) / expected time
 *
 *   ratio < 0.80   -> 12 pts per expected hour, but FLAGGED (estimate too loose, or rushed work)
 *   0.80 - 0.90    -> 12  (faster than target)
 *   0.90 - 1.10    -> 10  (on target)
 *   1.10 - 1.30    ->  6
 *   1.30 - 1.60    ->  3
 *   > 1.60         ->  0
 *
 * Points only count once the owner marks quality OK. Rework = 0.
 * Multiplying by expected hours means a 4-hour job is worth 4x a 1-hour job,
 * so nobody is punished for getting the long tasks.
 */

export type Band = "fast" | "on_target" | "slightly_late" | "late" | "very_late" | "suspicious";

export type ScoreInput = {
  status: string;
  quality: string | null;
  active_sec: number;
  expected_min: number;
};

export type Score = {
  ratio: number | null;
  band: Band | null;
  points: number; // final points (0 unless quality ok)
  provisional: number; // points it will get if marked OK
  flagged: boolean;
};

export function bandFor(ratio: number): { band: Band; perHour: number } {
  if (ratio < 0.8) return { band: "suspicious", perHour: 12 };
  if (ratio < 0.9) return { band: "fast", perHour: 12 };
  if (ratio <= 1.1) return { band: "on_target", perHour: 10 };
  if (ratio <= 1.3) return { band: "slightly_late", perHour: 6 };
  if (ratio <= 1.6) return { band: "late", perHour: 3 };
  return { band: "very_late", perHour: 0 };
}

export function scoreTask(t: ScoreInput): Score {
  if (t.status !== "done" || t.expected_min <= 0) {
    return { ratio: null, band: null, points: 0, provisional: 0, flagged: false };
  }
  const ratio = t.active_sec / 60 / t.expected_min;
  const { band, perHour } = bandFor(ratio);
  const provisional = Math.round(perHour * (t.expected_min / 60) * 10) / 10;
  return {
    ratio,
    band,
    provisional,
    points: t.quality === "ok" ? provisional : 0,
    flagged: band === "suspicious",
  };
}

export const BAND_LABEL: Record<Band, string> = {
  suspicious: "Too fast — check",
  fast: "Faster",
  on_target: "On target",
  slightly_late: "Slightly late",
  late: "Late",
  very_late: "Very late",
};
