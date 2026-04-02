import { Prisma } from "@prisma/client";
import { z } from "zod";

import { openai } from "../../lib/openai.js";
import { METRIC_KEYS, type MetricKey } from "../../lib/constants.js";
import {
    DAY_PARTS,
    addDaysUtc,
    average,
    dayPartForDate,
    endExclusiveUtcDay,
    extractKeywordCounts,
    keywordDelta,
    round,
    startOfUtcDay,
    startOfUtcWeek,
    type NumericStats,
    metricStatsMap,
    weekdayShort,
} from "../../lib/insights/helpers.js";
import { type WeeklyComparison, type WeeklyRollup } from "../../lib/insights/llmShapes.js";

export const REQUIRED_METRICS = METRIC_KEYS;
export { dayPartForDate };
export const MAX_POSE_INSIGHT_DAYS = 90;
export const DEFAULT_POSE_INSIGHT_DAYS = 30;
export const POSE_INSIGHT_WEEKLY_LIMIT = 3;
export const WEEKLY_INSIGHT_WEEKLY_LIMIT = 1;
export const PAIN_SCORE_MIN = 1;
export const PAIN_SCORE_MAX = 10;
const WEEKDAY_SHORT_TO_NUM: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
};

export const PAIN_SCALE_METADATA = {
    field: "pain",
    scoreDirection: "higher_is_better",
    bestScore: PAIN_SCORE_MAX,
    worstScore: PAIN_SCORE_MIN,
    description: "Pain score is inverted: 10 = least pain / best, 1 = most pain / worst.",
    derivedField: "painSeverity",
    derivedFormula: "painSeverity = 11 - pain",
};

export const weeklyInsightsBodySchema = z.object({
    weekStartDate: z.coerce.date().optional(),
    weekStartsOn: z.enum(["MONDAY", "SUNDAY"]).default("MONDAY"),
    timeZone: z.string().default("UTC"),
    includeDrafts: z.coerce.boolean().default(false),
});

export const poseInsightsBodySchema = z.object({
    poseId: z.string().min(1).optional(),
    poseSlug: z.string().min(1).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    days: z.coerce.number().int().min(1).max(MAX_POSE_INSIGHT_DAYS).optional(),
    timeZone: z.string().default("UTC"),
}).superRefine((body, ctx) => {
    if (body.startDate && body.endDate && body.startDate > body.endDate) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["endDate"],
            message: "endDate must be on or after startDate",
        });
    }
});

export type WeeklyInsightsBody = z.infer<typeof weeklyInsightsBodySchema>;
export type PoseInsightsBody = z.infer<typeof poseInsightsBodySchema>;

export class HttpError extends Error {
    status: number;
    payload?: unknown;

    constructor(status: number, message: string, payload?: unknown) {
        super(message);
        this.status = status;
        this.payload = payload;
    }
}

export function toJson(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
}

function parseModelJson(raw: string, fallback: Record<string, unknown>) {
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
        // noop
    }

    return fallback;
}

export function avg(nums: Array<number | null | undefined>) {
    return average(nums);
}

export function painSeverityFromScore(pain: number | null | undefined): number | null {
    if (typeof pain !== "number") return null;
    return (PAIN_SCORE_MAX + 1) - pain;
}

export function painSeverityFromAverage(avgPain: number | null): number | null {
    if (typeof avgPain !== "number") return null;
    return round((PAIN_SCORE_MAX + 1) - avgPain, 2);
}

export function toPainSeverityStats(stats: NumericStats): NumericStats {
    if (stats.count === 0) return stats;

    return {
        count: stats.count,
        average: painSeverityFromAverage(stats.average),
        stdDev: stats.stdDev,
        min: painSeverityFromAverage(stats.max),
        max: painSeverityFromAverage(stats.min),
        median: painSeverityFromAverage(stats.median),
    };
}

export async function runJsonInsightPrompt(
    systemPrompt: string,
    userPayload: object,
    fallback: Record<string, unknown>,
) {
    const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        temperature: 0.35,
        response_format: { type: "json_object" },
        messages: [
            { role: "system", content: systemPrompt },
            {
                role: "user",
                content: `Analyze this data and return strict JSON only.\n\nDATA:\n${JSON.stringify(userPayload)}`,
            },
        ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = parseModelJson(raw, fallback);

    return { parsed, raw, model: completion.model };
}

export function computeDelta(current: number | null, previous: number | null) {
    if (current == null || previous == null) return null;
    return round(current - previous, 2);
}

export function getGenerationQuotaWindow() {
    const start = startOfUtcWeek(new Date(), "MONDAY");
    const endExclusive = addDaysUtc(start, 7);
    return { start, endExclusive };
}

function addDaysYmd(
    year: number,
    month: number,
    day: number,
    days: number,
) {
    const utc = new Date(Date.UTC(year, month - 1, day));
    utc.setUTCDate(utc.getUTCDate() + days);

    return {
        year: utc.getUTCFullYear(),
        month: utc.getUTCMonth() + 1,
        day: utc.getUTCDate(),
    };
}

function getTimeZoneParts(date: Date, timeZone: string) {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });

    const parts = new Map(
        formatter
            .formatToParts(date)
            .filter((part) => part.type !== "literal")
            .map((part) => [part.type, part.value]),
    );

    const weekdayShort = parts.get("weekday");
    const weekday = weekdayShort ? WEEKDAY_SHORT_TO_NUM[weekdayShort] : undefined;

    return {
        year: Number(parts.get("year")),
        month: Number(parts.get("month")),
        day: Number(parts.get("day")),
        hour: Number(parts.get("hour")),
        minute: Number(parts.get("minute")),
        second: Number(parts.get("second")),
        weekday: typeof weekday === "number" ? weekday : date.getUTCDay(),
    };
}

function zonedDateTimeToUtc(
    input: { year: number; month: number; day: number; hour: number; minute: number; second: number },
    timeZone: string,
) {
    const utcGuess = Date.UTC(
        input.year,
        input.month - 1,
        input.day,
        input.hour,
        input.minute,
        input.second,
    );

    const tzParts = getTimeZoneParts(new Date(utcGuess), timeZone);
    const asUtcMs = Date.UTC(
        tzParts.year,
        tzParts.month - 1,
        tzParts.day,
        tzParts.hour,
        tzParts.minute,
        tzParts.second,
    );

    const offsetMs = asUtcMs - utcGuess;
    return new Date(utcGuess - offsetMs);
}

function startOfTimeZoneWeek(anchor: Date, weekStartsOn: "MONDAY" | "SUNDAY", timeZone: string) {
    const local = getTimeZoneParts(anchor, timeZone);
    const offset = weekStartsOn === "MONDAY"
        ? ((local.weekday + 6) % 7)
        : local.weekday;

    const startYmd = addDaysYmd(local.year, local.month, local.day, -offset);
    return zonedDateTimeToUtc(
        { ...startYmd, hour: 0, minute: 0, second: 0 },
        timeZone,
    );
}

function addDaysAtTimeZoneMidnight(date: Date, days: number, timeZone: string) {
    const local = getTimeZoneParts(date, timeZone);
    const next = addDaysYmd(local.year, local.month, local.day, days);
    return zonedDateTimeToUtc(
        { ...next, hour: 0, minute: 0, second: 0 },
        timeZone,
    );
}

function startOfProvidedDateInTimeZone(date: Date, timeZone: string) {
    const utcYear = date.getUTCFullYear();
    const utcMonth = date.getUTCMonth() + 1;
    const utcDay = date.getUTCDate();

    return zonedDateTimeToUtc(
        { year: utcYear, month: utcMonth, day: utcDay, hour: 0, minute: 0, second: 0 },
        timeZone,
    );
}

function resolveTimeZoneOrUtc(timeZone: string) {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
        return timeZone;
    } catch {
        return "UTC";
    }
}

export function resolveWeeklyWindow(input: WeeklyInsightsBody) {
    const timeZone = resolveTimeZoneOrUtc(input.timeZone);
    const currentStart = input.weekStartDate
        ? startOfProvidedDateInTimeZone(input.weekStartDate, timeZone)
        : addDaysAtTimeZoneMidnight(
            startOfTimeZoneWeek(new Date(), input.weekStartsOn, timeZone),
            -7,
            timeZone,
        );

    const currentEndExclusive = addDaysAtTimeZoneMidnight(currentStart, 7, timeZone);
    const previousStart = addDaysAtTimeZoneMidnight(currentStart, -7, timeZone);
    const previousEndExclusive = currentStart;

    return { currentStart, currentEndExclusive, previousStart, previousEndExclusive };
}

export function resolvePoseWindow(input: PoseInsightsBody) {
    const dayCount = input.days ?? DEFAULT_POSE_INSIGHT_DAYS;

    if (input.startDate && input.endDate) {
        const start = startOfUtcDay(input.startDate);
        const endExclusive = endExclusiveUtcDay(input.endDate);
        const totalDays = Math.ceil((endExclusive.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));

        if (totalDays > MAX_POSE_INSIGHT_DAYS) {
            throw new HttpError(422, `Timeframe too large. Max is ${MAX_POSE_INSIGHT_DAYS} days.`);
        }

        return { start, endExclusive, totalDays };
    }

    if (input.startDate) {
        const start = startOfUtcDay(input.startDate);
        const endExclusive = addDaysUtc(start, dayCount);
        return { start, endExclusive, totalDays: dayCount };
    }

    const endReference = input.endDate ? endExclusiveUtcDay(input.endDate) : endExclusiveUtcDay(new Date());
    const start = addDaysUtc(endReference, -dayCount);

    return {
        start,
        endExclusive: endReference,
        totalDays: dayCount,
    };
}

export function buildWeeklyRollup(
    sessions: Array<{
        id: string;
        date: Date;
        overallScore: number | null;
        durationMinutes: number | null;
        notes: string | null;
        scoreCards: Array<{
            notes: string | null;
            ease: number | null;
            comfort: number | null;
            stability: number | null;
            pain: number | null;
            breath: number | null;
            focus: number | null;
        }>;
    }>,
    timeZone: string,
): WeeklyRollup {
    const dayPartBuckets = new Map<typeof DAY_PARTS[number], {
        scores: Array<number | null>;
        pain: Array<number | null>;
        focus: Array<number | null>;
        count: number;
    }>();

    const weekdayBuckets = new Map<string, Array<number | null>>();

    for (const part of DAY_PARTS) {
        dayPartBuckets.set(part, { scores: [], pain: [], focus: [], count: 0 });
    }

    for (const session of sessions) {
        const part = dayPartForDate(session.date, timeZone);
        const partBucket = dayPartBuckets.get(part)!;

        partBucket.count += 1;
        partBucket.scores.push(session.overallScore);
        partBucket.pain.push(avg(session.scoreCards.map((card) => card.pain)));
        partBucket.focus.push(avg(session.scoreCards.map((card) => card.focus)));

        const weekday = weekdayShort(session.date, timeZone);
        const weekdayScores = weekdayBuckets.get(weekday) ?? [];
        weekdayScores.push(session.overallScore);
        weekdayBuckets.set(weekday, weekdayScores);
    }

    const allCards = sessions.flatMap((session) => session.scoreCards);
    const sessionNotes = sessions.map((session) => session.notes);
    const cardNotes = allCards.map((card) => card.notes);

    return {
        sessionCount: sessions.length,
        averageOverallScore: avg(sessions.map((session) => session.overallScore)),
        averageDurationMinutes: avg(sessions.map((session) => session.durationMinutes)),
        metricStats: metricStatsMap(allCards, REQUIRED_METRICS),
        dayPartSummaries: DAY_PARTS.map((part) => {
            const bucket = dayPartBuckets.get(part)!;
            return {
                dayPart: part,
                sessionCount: bucket.count,
                averageOverallScore: avg(bucket.scores),
                averagePain: avg(bucket.pain),
                averageFocus: avg(bucket.focus),
            };
        }),
        weekdaySummaries: [...weekdayBuckets.entries()]
            .map(([weekday, scores]) => ({
                weekday,
                sessionCount: scores.length,
                averageOverallScore: avg(scores),
            }))
            .sort((a, b) => a.weekday.localeCompare(b.weekday)),
        noteKeywordCounts: extractKeywordCounts([...sessionNotes, ...cardNotes], { maxKeywords: 16 }),
        noteSamples: sessions
            .filter((session) => typeof session.notes === "string" && session.notes.trim().length > 0)
            .slice(0, 8)
            .map((session) => ({
                sessionId: session.id,
                date: session.date.toISOString(),
                overallScore: session.overallScore,
                note: session.notes!.trim(),
            })),
        sessionsWithNotes: sessions.filter((session) => typeof session.notes === "string" && session.notes.trim().length > 0).length,
    };
}

export function buildWeeklyComparison(current: WeeklyRollup, previous: WeeklyRollup | null): WeeklyComparison {
    if (!previous || previous.sessionCount === 0) {
        return {
            hasPreviousWeekData: false,
            sessionCountDelta: current.sessionCount,
            averageOverallScoreDelta: null,
            averageDurationDeltaMinutes: null,
            shiftedDayPart: null,
            noteKeywordDelta: {},
        };
    }

    let shiftedDayPart: WeeklyComparison["shiftedDayPart"] = null;

    for (const part of DAY_PARTS) {
        const currentCount = current.dayPartSummaries.find((item) => item.dayPart === part)?.sessionCount ?? 0;
        const previousCount = previous.dayPartSummaries.find((item) => item.dayPart === part)?.sessionCount ?? 0;
        const delta = currentCount - previousCount;

        if (!shiftedDayPart || Math.abs(delta) > Math.abs(shiftedDayPart.sessionDelta)) {
            shiftedDayPart = { dayPart: part, sessionDelta: delta };
        }
    }

    return {
        hasPreviousWeekData: true,
        sessionCountDelta: current.sessionCount - previous.sessionCount,
        averageOverallScoreDelta: computeDelta(current.averageOverallScore, previous.averageOverallScore),
        averageDurationDeltaMinutes: computeDelta(current.averageDurationMinutes, previous.averageDurationMinutes),
        shiftedDayPart,
        noteKeywordDelta: keywordDelta(current.noteKeywordCounts, previous.noteKeywordCounts),
    };
}

export type SessionAiResponse = {
    session: {
        id: string;
        status: string;
        date: string;
        overallScore: number | null;
        summary: {
            total: number;
            complete: number;
            incomplete: number;
            firstIncompleteScoreCardId: string | null;
        };
    };
    computed: {
        metricAverages: Record<MetricKey, number | null>;
        painHotSpots: Array<{
            scoreCardId: string;
            pose: string;
            side: string | null;
            pain: number | null;
            painSeverity: number | null;
            notes: string | null;
        }>;
    };
    ai: Record<string, unknown>;
    debug: {
        model: string;
        raw: string;
    };
};
