import { type MetricKey } from "../constants.js";

export const DAY_PARTS = ["EARLY_MORNING", "MORNING", "AFTERNOON", "EVENING", "NIGHT"] as const;
export type DayPart = (typeof DAY_PARTS)[number];

export type NumericStats = {
    count: number;
    average: number | null;
    stdDev: number | null;
    min: number | null;
    max: number | null;
    median: number | null;
};

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const NOTE_STOP_WORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "had", "has", "have",
    "i", "in", "is", "it", "its", "me", "my", "of", "on", "or", "so", "that", "the", "this", "to",
    "too", "very", "was", "we", "were", "with", "you", "your", "felt", "feel", "today", "during",
]);

export function round(value: number, digits = 2): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

export function toNumberArray(values: Array<number | null | undefined>): number[] {
    return values.filter((v): v is number => typeof v === "number");
}

export function average(values: Array<number | null | undefined>): number | null {
    const xs = toNumberArray(values);
    if (!xs.length) return null;
    return round(xs.reduce((acc, n) => acc + n, 0) / xs.length, 2);
}

export function standardDeviation(values: Array<number | null | undefined>): number | null {
    const xs = toNumberArray(values);
    if (xs.length < 2) return null;

    const mean = xs.reduce((acc, n) => acc + n, 0) / xs.length;
    const variance = xs.reduce((acc, n) => acc + ((n - mean) ** 2), 0) / xs.length;

    return round(Math.sqrt(variance), 3);
}

export function median(values: Array<number | null | undefined>): number | null {
    const xs = toNumberArray(values).sort((a, b) => a - b);
    if (!xs.length) return null;

    const mid = Math.floor(xs.length / 2);
    if (xs.length % 2 === 1) return round(xs[mid], 2);

    return round((xs[mid - 1] + xs[mid]) / 2, 2);
}

export function summarizeNumericStats(values: Array<number | null | undefined>): NumericStats {
    const xs = toNumberArray(values);
    if (!xs.length) {
        return { count: 0, average: null, stdDev: null, min: null, max: null, median: null };
    }

    return {
        count: xs.length,
        average: average(xs),
        stdDev: standardDeviation(xs),
        min: round(Math.min(...xs), 2),
        max: round(Math.max(...xs), 2),
        median: median(xs),
    };
}

export function linearRegressionSlope(
    points: Array<{ x: number; y: number | null | undefined }>,
): number | null {
    const usable = points.filter((p): p is { x: number; y: number } => typeof p.y === "number");
    if (usable.length < 2) return null;

    const n = usable.length;
    const sumX = usable.reduce((acc, p) => acc + p.x, 0);
    const sumY = usable.reduce((acc, p) => acc + p.y, 0);
    const sumXY = usable.reduce((acc, p) => acc + (p.x * p.y), 0);
    const sumXX = usable.reduce((acc, p) => acc + (p.x * p.x), 0);

    const denominator = (n * sumXX) - (sumX ** 2);
    if (denominator === 0) return null;

    return round(((n * sumXY) - (sumX * sumY)) / denominator, 4);
}

export function startOfUtcDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function endExclusiveUtcDay(date: Date): Date {
    const start = startOfUtcDay(date);
    return addDaysUtc(start, 1);
}

export function addDaysUtc(date: Date, days: number): Date {
    return new Date(date.getTime() + (days * 24 * 60 * 60 * 1000));
}

export function startOfUtcWeek(anchor: Date, weekStartsOn: "MONDAY" | "SUNDAY" = "MONDAY"): Date {
    const dayStart = startOfUtcDay(anchor);
    const dow = dayStart.getUTCDay(); // 0 = sunday

    const offset = weekStartsOn === "MONDAY"
        ? ((dow + 6) % 7) // monday -> 0, sunday -> 6
        : dow;

    return addDaysUtc(dayStart, -offset);
}

export function isoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

export function getHourInTimeZone(date: Date, timeZone: string): number {
    try {
        const formatter = new Intl.DateTimeFormat("en-US", {
            timeZone,
            hour: "2-digit",
            hour12: false,
        });

        const hourPart = formatter
            .formatToParts(date)
            .find((part) => part.type === "hour")
            ?.value;

        const parsed = Number(hourPart);
        if (Number.isFinite(parsed)) return parsed;
    } catch {
        // fall back to UTC hour below
    }

    return date.getUTCHours();
}

export function dayPartForDate(date: Date, timeZone: string): DayPart {
    const hour = getHourInTimeZone(date, timeZone);
    if (hour >= 4 && hour <= 7) return "EARLY_MORNING";
    if (hour >= 8 && hour <= 11) return "MORNING";
    if (hour >= 12 && hour <= 16) return "AFTERNOON";
    if (hour >= 17 && hour <= 20) return "EVENING";
    return "NIGHT";
}

export function weekdayShort(date: Date, timeZone: string): string {
    try {
        return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
    } catch {
        return WEEKDAY_SHORT[date.getUTCDay()];
    }
}

export function extractKeywordCounts(
    notes: Array<string | null | undefined>,
    opts?: { maxKeywords?: number; minLength?: number },
): Record<string, number> {
    const maxKeywords = opts?.maxKeywords ?? 12;
    const minLength = opts?.minLength ?? 3;

    const counts = new Map<string, number>();

    for (const note of notes) {
        if (!note) continue;

        const tokens = note
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/)
            .filter(Boolean)
            .filter((token) => token.length >= minLength)
            .filter((token) => !NOTE_STOP_WORDS.has(token));

        for (const token of tokens) {
            counts.set(token, (counts.get(token) ?? 0) + 1);
        }
    }

    return Object.fromEntries(
        [...counts.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, maxKeywords),
    );
}

export function keywordDelta(
    current: Record<string, number>,
    previous: Record<string, number>,
): Record<string, number> {
    const keys = new Set([...Object.keys(current), ...Object.keys(previous)]);
    const delta = new Map<string, number>();

    for (const key of keys) {
        const diff = (current[key] ?? 0) - (previous[key] ?? 0);
        if (diff !== 0) delta.set(key, diff);
    }

    return Object.fromEntries(
        [...delta.entries()]
            .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]) || a[0].localeCompare(b[0]))
            .slice(0, 10),
    );
}

export function metricStatsMap<T extends Partial<Record<MetricKey, number | null | undefined>>>(
    rows: T[],
    metricKeys: readonly MetricKey[],
): Record<MetricKey, NumericStats> {
    return Object.fromEntries(
        metricKeys.map((metric) => [
            metric,
            summarizeNumericStats(rows.map((row) => row[metric] ?? null)),
        ]),
    ) as Record<MetricKey, NumericStats>;
}
