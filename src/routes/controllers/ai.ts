import { Request, Response } from "express";
import { z } from "zod";

import { openai } from "../../lib/openai.js";
import prisma from "../../lib/prisma.js";
import { METRIC_KEYS, type MetricKey } from "../../lib/constants.js";
import {
    DAY_PARTS,
    addDaysUtc,
    average,
    dayPartForDate,
    endExclusiveUtcDay,
    extractKeywordCounts,
    isoDate,
    keywordDelta,
    linearRegressionSlope,
    metricStatsMap,
    round,
    startOfUtcDay,
    startOfUtcWeek,
    type NumericStats,
    summarizeNumericStats,
    weekdayShort,
} from "../../lib/insights/helpers.js";
import {
    buildPoseInsightsLlmInput,
    buildWeeklyInsightsLlmInput,
    type PoseInsightsLlmInput,
    type WeeklyComparison,
    type WeeklyRollup,
} from "../../lib/insights/llmShapes.js";

const REQUIRED_METRICS = METRIC_KEYS;
const MAX_POSE_INSIGHT_DAYS = 90;
const DEFAULT_POSE_INSIGHT_DAYS = 30;
const PAIN_SCORE_MIN = 1;
const PAIN_SCORE_MAX = 10;

const PAIN_SCALE_METADATA = {
    field: "pain",
    scoreDirection: "higher_is_better",
    bestScore: PAIN_SCORE_MAX,
    worstScore: PAIN_SCORE_MIN,
    description: "Pain score is inverted: 10 = least pain / best, 1 = most pain / worst.",
    derivedField: "painSeverity",
    derivedFormula: "painSeverity = 11 - pain",
};

const weeklyInsightsBodySchema = z.object({
    weekStartDate: z.coerce.date().optional(),
    weekStartsOn: z.enum(["MONDAY", "SUNDAY"]).default("MONDAY"),
    timeZone: z.string().default("UTC"),
    includeDrafts: z.coerce.boolean().default(false),
});

const poseInsightsBodySchema = z.object({
    poseId: z.string().min(1).optional(),
    poseSlug: z.string().min(1).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    days: z.coerce.number().int().min(1).max(MAX_POSE_INSIGHT_DAYS).optional(),
    timeZone: z.string().default("UTC"),
}).superRefine((body, ctx) => {
    // if (!body.poseId && !body.poseSlug) {
    //     ctx.addIssue({
    //         code: z.ZodIssueCode.custom,
    //         path: ["poseId"],
    //         message: "Provide either poseId or poseSlug",
    //     });
    // }

    if (body.startDate && body.endDate && body.startDate > body.endDate) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["endDate"],
            message: "endDate must be on or after startDate",
        });
    }
});

function parseModelJson(raw: string, fallback: Record<string, unknown>) {
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
        // noop
    }

    return fallback;
}

function avg(nums: Array<number | null | undefined>) {
    return average(nums);
}

function painSeverityFromScore(pain: number | null | undefined): number | null {
    if (typeof pain !== "number") return null;
    return (PAIN_SCORE_MAX + 1) - pain;
}

function painSeverityFromAverage(avgPain: number | null): number | null {
    if (typeof avgPain !== "number") return null;
    return round((PAIN_SCORE_MAX + 1) - avgPain, 2);
}

function toPainSeverityStats(stats: NumericStats): NumericStats {
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

async function runJsonInsightPrompt(
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

function computeDelta(current: number | null, previous: number | null) {
    if (current == null || previous == null) return null;
    return round(current - previous, 2);
}

function resolveWeeklyWindow(input: z.infer<typeof weeklyInsightsBodySchema>) {
    const anchor = input.weekStartDate ?? new Date();
    const currentStart = input.weekStartDate
        ? startOfUtcDay(input.weekStartDate)
        : startOfUtcWeek(anchor, input.weekStartsOn);

    const currentEndExclusive = addDaysUtc(currentStart, 7);
    const previousStart = addDaysUtc(currentStart, -7);
    const previousEndExclusive = currentStart;

    return { currentStart, currentEndExclusive, previousStart, previousEndExclusive };
}

function resolvePoseWindow(input: z.infer<typeof poseInsightsBodySchema>) {
    const dayCount = input.days ?? DEFAULT_POSE_INSIGHT_DAYS;

    if (input.startDate && input.endDate) {
        const start = startOfUtcDay(input.startDate);
        const endExclusive = endExclusiveUtcDay(input.endDate);
        const totalDays = Math.ceil((endExclusive.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));

        if (totalDays > MAX_POSE_INSIGHT_DAYS) {
            throw Object.assign(
                new Error(`Timeframe too large. Max is ${MAX_POSE_INSIGHT_DAYS} days.`),
                { status: 422 },
            );
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

function buildWeeklyRollup(
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

function buildWeeklyComparison(current: WeeklyRollup, previous: WeeklyRollup | null): WeeklyComparison {
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

export const getSessionAiInsight = async (req: Request, res: Response) => {
    const client = req.user as { id: string } | undefined;
    if (!client?.id) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing session id" });

    try {
        const session = await prisma.practiceSession.findFirst({
            where: { id, userId: client.id },
            select: {
                id: true,
                status: true,
                date: true,
                overallScore: true,
                label: true,
                practiceType: true,
                durationMinutes: true,
                scoreCards: {
                    orderBy: { orderInSession: "asc" },
                    select: {
                        id: true,
                        side: true,
                        skipped: true,
                        overallScore: true,
                        notes: true,
                        ease: true,
                        comfort: true,
                        stability: true,
                        pain: true,
                        breath: true,
                        focus: true,
                        pose: {
                            select: {
                                sanskritName: true,
                                sequenceGroup: true,
                                slug: true,
                            },
                        },
                    },
                },
            },
        });

        if (!session) return res.status(404).json({ error: "Session not found" });

        const scoreCards = session.scoreCards.map((c) => {
            const missingAny =
                !c.skipped && REQUIRED_METRICS.some((k) => c[k] == null);
            return {
                id: c.id,
                side: c.side,
                skipped: c.skipped,
                overallScore: c.overallScore,
                isComplete: c.skipped ? true : !missingAny,
                pose: {
                    sanskritName: c.pose.sanskritName,
                    sequenceGroup: c.pose.sequenceGroup,
                    slug: c.pose.slug,
                },
                notes: c.notes,
                metrics: {
                    ease: c.ease,
                    comfort: c.comfort,
                    stability: c.stability,
                    pain: c.pain,
                    breath: c.breath,
                    focus: c.focus,
                },
            };
        });

        const activeCards = scoreCards.filter((c) => !c.skipped);

        const metricAverages: Record<MetricKey, number | null> = {
            ease: avg(activeCards.map((c) => c.metrics.ease)),
            comfort: avg(activeCards.map((c) => c.metrics.comfort)),
            stability: avg(activeCards.map((c) => c.metrics.stability)),
            pain: avg(activeCards.map((c) => c.metrics.pain)),
            breath: avg(activeCards.map((c) => c.metrics.breath)),
            focus: avg(activeCards.map((c) => c.metrics.focus)),
        };

        const painHotSpots = [...activeCards]
            .filter((c) => typeof c.metrics.pain === "number")
            .sort((a, b) => (a.metrics.pain ?? 99) - (b.metrics.pain ?? 99))
            .slice(0, 5)
            .map((c) => ({
                scoreCardId: c.id,
                pose: c.pose.sanskritName,
                side: c.side,
                pain: c.metrics.pain,
                painSeverity: painSeverityFromScore(c.metrics.pain),
                notes: c.notes ?? null,
            }));

        const summary = {
            total: scoreCards.length,
            complete: scoreCards.filter((c) => c.isComplete).length,
            incomplete: scoreCards.filter((c) => !c.isComplete).length,
            firstIncompleteScoreCardId: scoreCards.find((c) => !c.isComplete)?.id ?? null,
        };

        const payloadForModel = {
            session: {
                id: session.id,
                status: session.status,
                date: session.date.toISOString(),
                label: session.label,
                practiceType: session.practiceType,
                durationMinutes: session.durationMinutes,
                overallScore: session.overallScore,
            },
            summary,
            computed: {
                metricAverages,
                painSeverityAverage: painSeverityFromAverage(metricAverages.pain),
                painHotSpots,
            },
            scales: {
                pain: PAIN_SCALE_METADATA,
            },
            scoreCards: scoreCards.map((c) => ({
                id: c.id,
                pose: c.pose.sanskritName,
                group: c.pose.sequenceGroup,
                side: c.side,
                skipped: c.skipped,
                overallScore: c.overallScore,
                metrics: {
                    ...c.metrics,
                    painSeverity: painSeverityFromScore(c.metrics.pain),
                },
                notes: c.notes,
            })),
        };

        const system = `
You are a careful yoga practice review assistant.
Analyze one practice session.

Return STRICT JSON with keys:
- summary: string (2-4 sentences)
- insights: string[] (3-6 bullets)
- redFlags: string[] (only if supported by pain/notes patterns; otherwise empty)
- followUps: string[] (questions the user could answer next time)

Constraints:
- No medical diagnosis.
- Pain score is inverted: 10 = least pain (best), 1 = most pain (worst).
- Treat lower pain score (or higher painSeverity) as higher pain concern.
- If pain score is low or notes suggest injury, recommend caution and professional guidance.
`.trim();

        const completion = await runJsonInsightPrompt(
            system,
            payloadForModel,
            { summary: "Failed to parse model output", insights: [], redFlags: [], followUps: [] },
        );

        return res.json({
            session: {
                id: session.id,
                status: session.status,
                date: session.date.toISOString(),
                overallScore: session.overallScore,
                summary,
            },
            computed: { metricAverages, painHotSpots },
            ai: completion.parsed,
            debug: { model: completion.model, raw: completion.raw },
        });
    } catch (err) {
        console.error("getSessionAiInsight error", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

export const getWeeklyInsights = async (req: Request, res: Response) => {
    const client = req.user as { id: string } | undefined;
    if (!client?.id) return res.status(401).json({ error: "Unauthorized" });

    const body = weeklyInsightsBodySchema.parse(req.body ?? {});
    const window = resolveWeeklyWindow(body);

    try {
        const [currentSessions, previousSessions] = await Promise.all([
            prisma.practiceSession.findMany({
                where: {
                    userId: client.id,
                    date: { gte: window.currentStart, lt: window.currentEndExclusive },
                    ...(body.includeDrafts ? {} : { status: "PUBLISHED" }),
                },
                orderBy: [{ date: "asc" }, { id: "asc" }],
                select: {
                    id: true,
                    date: true,
                    overallScore: true,
                    durationMinutes: true,
                    notes: true,
                    scoreCards: {
                        where: { skipped: false },
                        select: {
                            notes: true,
                            ease: true,
                            comfort: true,
                            stability: true,
                            pain: true,
                            breath: true,
                            focus: true,
                        },
                    },
                },
            }),
            prisma.practiceSession.findMany({
                where: {
                    userId: client.id,
                    date: { gte: window.previousStart, lt: window.previousEndExclusive },
                    ...(body.includeDrafts ? {} : { status: "PUBLISHED" }),
                },
                orderBy: [{ date: "asc" }, { id: "asc" }],
                select: {
                    id: true,
                    date: true,
                    overallScore: true,
                    durationMinutes: true,
                    notes: true,
                    scoreCards: {
                        where: { skipped: false },
                        select: {
                            notes: true,
                            ease: true,
                            comfort: true,
                            stability: true,
                            pain: true,
                            breath: true,
                            focus: true,
                        },
                    },
                },
            }),
        ]);

        const currentRollup = buildWeeklyRollup(currentSessions, body.timeZone);
        const previousRollup = previousSessions.length > 0
            ? buildWeeklyRollup(previousSessions, body.timeZone)
            : null;

        const comparison = buildWeeklyComparison(currentRollup, previousRollup);

        const llmInput = buildWeeklyInsightsLlmInput({
            context: {
                generatedAt: new Date().toISOString(),
                timeZone: body.timeZone,
                week: {
                    start: window.currentStart.toISOString(),
                    endExclusive: window.currentEndExclusive.toISOString(),
                },
                previousWeek: {
                    start: window.previousStart.toISOString(),
                    endExclusive: window.previousEndExclusive.toISOString(),
                },
            },
            currentWeek: currentRollup,
            previousWeek: previousRollup,
            comparison,
        });

        const llmInputForModel = {
            ...llmInput,
            scales: {
                pain: PAIN_SCALE_METADATA,
            },
            derived: {
                currentWeek: {
                    painSeverityStats: toPainSeverityStats(llmInput.currentWeek.metricStats.pain),
                    byDayPart: llmInput.currentWeek.dayPartSummaries.map((item) => ({
                        dayPart: item.dayPart,
                        averagePainScore: item.averagePain,
                        averagePainSeverity: painSeverityFromAverage(item.averagePain),
                    })),
                },
                previousWeek: llmInput.previousWeek
                    ? {
                        painSeverityStats: toPainSeverityStats(llmInput.previousWeek.metricStats.pain),
                        byDayPart: llmInput.previousWeek.dayPartSummaries.map((item) => ({
                            dayPart: item.dayPart,
                            averagePainScore: item.averagePain,
                            averagePainSeverity: painSeverityFromAverage(item.averagePain),
                        })),
                    }
                    : null,
            },
        };

        const systemPrompt = `
You are a careful yoga weekly insights assistant.
Analyze weekly practice trends and compare current vs previous week when available.

Return STRICT JSON with keys:
- summary: string (2-4 sentences)
- patterns: string[] (3-6 bullets)
- comparisons: string[] (0-5 bullets, empty if no previous data)
- cautions: string[] (potential risk or overtraining signals; empty if none)
- nextWeekFocus: string[] (2-5 practical actions)

Constraints:
- Ground claims in data provided.
- Mention uncertainty when sample size is low.
- Pain score is inverted: 10 = least pain (best), 1 = most pain (worst).
- Treat lower pain score (or higher painSeverity) as higher pain concern.
- No medical diagnosis.
`.trim();

        const aiResult = await runJsonInsightPrompt(
            systemPrompt,
            llmInputForModel,
            { summary: "Could not generate weekly insights.", patterns: [], comparisons: [], cautions: [], nextWeekFocus: [] },
        );

        return res.json({
            window: {
                currentWeek: {
                    start: window.currentStart.toISOString(),
                    endExclusive: window.currentEndExclusive.toISOString(),
                },
                previousWeek: {
                    start: window.previousStart.toISOString(),
                    endExclusive: window.previousEndExclusive.toISOString(),
                },
            },
            computed: {
                currentWeek: currentRollup,
                previousWeek: previousRollup,
                comparison,
            },
            llmInput,
            ai: aiResult.parsed,
            debug: { model: aiResult.model, raw: aiResult.raw },
        });
    } catch (err: unknown) {
        console.error("getWeeklyInsights error", err);

        const status = typeof err === "object" && err && "status" in err
            ? Number((err as { status: number }).status)
            : 500;

        const message = err instanceof Error ? err.message : "Internal server error";
        return res.status(status).json({ error: message });
    }
};

export const getPoseInsights = async (req: Request, res: Response) => {
    const client = req.user as { id: string } | undefined;
    if (!client?.id) return res.status(401).json({ error: "Unauthorized" });

    const poseId = req.params.id;
    const body = poseInsightsBodySchema.parse(req.body ?? {});

    try {
        const window = resolvePoseWindow(body);

        const pose = await prisma.pose.findFirst({
            where: poseId ? { id: poseId } : { slug: body.poseSlug },
            select: {
                id: true,
                slug: true,
                sanskritName: true,
                englishName: true,
            },
        });

        if (!pose) return res.status(404).json({ error: "Pose not found" });

        const cards = await prisma.scoreCard.findMany({
            where: {
                poseId: pose.id,
                skipped: false,
                session: {
                    userId: client.id,
                    status: "PUBLISHED",
                    date: { gte: window.start, lt: window.endExclusive },
                },
            },
            orderBy: [{ session: { date: "asc" } }, { id: "asc" }],
            select: {
                id: true,
                side: true,
                notes: true,
                overallScore: true,
                ease: true,
                comfort: true,
                stability: true,
                pain: true,
                breath: true,
                focus: true,
                session: {
                    select: {
                        id: true,
                        date: true,
                        notes: true,
                    },
                },
            },
        });

        const uniqueSessions = new Set(cards.map((card) => card.session.id));
        const metricStats = metricStatsMap(cards, REQUIRED_METRICS);

        const sideMap = new Map<string, typeof cards>();
        for (const card of cards) {
            const side = card.side ?? "NA";
            const rows = sideMap.get(side) ?? [];
            rows.push(card);
            sideMap.set(side, rows);
        }

        const byDayPartMap = new Map<typeof DAY_PARTS[number], {
            score: Array<number | null>;
            pain: Array<number | null>;
            focus: Array<number | null>;
            count: number;
        }>();

        for (const part of DAY_PARTS) {
            byDayPartMap.set(part, { score: [], pain: [], focus: [], count: 0 });
        }

        const byDate = new Map<string, {
            overallScore: Array<number | null>;
            pain: Array<number | null>;
            focus: Array<number | null>;
            stability: Array<number | null>;
            count: number;
        }>();

        for (const card of cards) {
            const dayPart = dayPartForDate(card.session.date, body.timeZone);
            const dayPartBucket = byDayPartMap.get(dayPart)!;

            dayPartBucket.count += 1;
            dayPartBucket.score.push(card.overallScore);
            dayPartBucket.pain.push(card.pain);
            dayPartBucket.focus.push(card.focus);

            const dateKey = isoDate(card.session.date);
            const dayBucket = byDate.get(dateKey) ?? {
                overallScore: [], pain: [], focus: [], stability: [], count: 0,
            };

            dayBucket.count += 1;
            dayBucket.overallScore.push(card.overallScore);
            dayBucket.pain.push(card.pain);
            dayBucket.focus.push(card.focus);
            dayBucket.stability.push(card.stability);
            byDate.set(dateKey, dayBucket);
        }

        const timeSeries = [...byDate.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, values]) => ({
                date,
                sampleCount: values.count,
                averageOverallScore: avg(values.overallScore),
                averagePain: avg(values.pain),
                averageFocus: avg(values.focus),
                averageStability: avg(values.stability),
            }));

        const overallScoreSlopePerDay = linearRegressionSlope(
            timeSeries.map((point, index) => ({ x: index, y: point.averageOverallScore })),
        );
        const painSlopePerDay = linearRegressionSlope(
            timeSeries.map((point, index) => ({ x: index, y: point.averagePain })),
        );
        const focusSlopePerDay = linearRegressionSlope(
            timeSeries.map((point, index) => ({ x: index, y: point.averageFocus })),
        );

        const llmInput: PoseInsightsLlmInput = buildPoseInsightsLlmInput({
            context: {
                generatedAt: new Date().toISOString(),
                timeZone: body.timeZone,
                timeframe: {
                    start: window.start.toISOString(),
                    endExclusive: window.endExclusive.toISOString(),
                    totalDays: window.totalDays,
                },
                pose: {
                    id: pose.id,
                    slug: pose.slug,
                    sanskritName: pose.sanskritName,
                    englishName: pose.englishName,
                },
            },
            summary: {
                totalSessions: uniqueSessions.size,
                totalScoreCards: cards.length,
                overallScoreStats: summarizeNumericStats(cards.map((card) => card.overallScore)),
                metricStats,
                sideBreakdown: [...sideMap.entries()].map(([side, rows]) => ({
                    side,
                    sampleCount: rows.length,
                    overallScoreStats: summarizeNumericStats(rows.map((row) => row.overallScore)),
                    painStats: summarizeNumericStats(rows.map((row) => row.pain)),
                    focusStats: summarizeNumericStats(rows.map((row) => row.focus)),
                })),
                byDayPart: DAY_PARTS.map((part) => {
                    const bucket = byDayPartMap.get(part)!;
                    return {
                        dayPart: part,
                        sampleCount: bucket.count,
                        averageOverallScore: avg(bucket.score),
                        averagePain: avg(bucket.pain),
                        averageFocus: avg(bucket.focus),
                    };
                }),
                trend: {
                    overallScoreSlopePerDay,
                    painSlopePerDay,
                    focusSlopePerDay,
                },
                noteSignals: {
                    cardsWithNotes: cards.filter((card) => typeof card.notes === "string" && card.notes.trim().length > 0).length,
                    keywords: extractKeywordCounts(cards.map((card) => card.notes), { maxKeywords: 16 }),
                    noteSamples: cards
                        .filter((card) => typeof card.notes === "string" && card.notes.trim().length > 0)
                        .slice(-8)
                        .map((card) => ({
                            date: card.session.date.toISOString(),
                            side: card.side,
                            note: card.notes!.trim(),
                        })),
                },
            },
            timeSeries,
        });

        const llmInputForModel = {
            ...llmInput,
            scales: {
                pain: PAIN_SCALE_METADATA,
            },
            derived: {
                summary: {
                    painSeverityStats: toPainSeverityStats(llmInput.summary.metricStats.pain),
                    byDayPart: llmInput.summary.byDayPart.map((item) => ({
                        dayPart: item.dayPart,
                        averagePainScore: item.averagePain,
                        averagePainSeverity: painSeverityFromAverage(item.averagePain),
                    })),
                    sideBreakdown: llmInput.summary.sideBreakdown.map((item) => ({
                        side: item.side,
                        painScoreStats: item.painStats,
                        painSeverityStats: toPainSeverityStats(item.painStats),
                    })),
                },
                timeSeries: llmInput.timeSeries.map((item) => ({
                    date: item.date,
                    averagePainScore: item.averagePain,
                    averagePainSeverity: painSeverityFromAverage(item.averagePain),
                })),
            },
        };

        const systemPrompt = `
You are a careful yoga pose-specific insights assistant.
Analyze performance trends for one pose over time.

Return STRICT JSON with keys:
- summary: string (2-4 sentences)
- trendAssessment: string[] (2-5 bullets)
- stabilitySignals: string[] (2-5 bullets)
- riskSignals: string[] (possible risk patterns from pain + notes, empty if none)
- recommendations: string[] (2-6 practical actions)
- questionsForNextSessions: string[] (1-4 prompts)

Constraints:
- Use only provided data.
- Explicitly acknowledge low sample size.
- Pain score is inverted: 10 = least pain (best), 1 = most pain (worst).
- Treat lower pain score (or higher painSeverity) as higher pain concern.
- No medical diagnosis.
`.trim();

        const aiResult = await runJsonInsightPrompt(
            systemPrompt,
            llmInputForModel,
            {
                summary: "Could not generate pose insights.",
                trendAssessment: [],
                stabilitySignals: [],
                riskSignals: [],
                recommendations: [],
                questionsForNextSessions: [],
            },
        );

        return res.json({
            pose,
            timeframe: {
                start: window.start.toISOString(),
                endExclusive: window.endExclusive.toISOString(),
                totalDays: window.totalDays,
            },
            computed: llmInput.summary,
            llmInput,
            ai: aiResult.parsed,
            debug: { model: aiResult.model, raw: aiResult.raw },
        });
    } catch (err: unknown) {
        console.error("getPoseInsights error", err);

        const status = typeof err === "object" && err && "status" in err
            ? Number((err as { status: number }).status)
            : 500;

        const message = err instanceof Error ? err.message : "Internal server error";
        return res.status(status).json({ error: message });
    }
};
