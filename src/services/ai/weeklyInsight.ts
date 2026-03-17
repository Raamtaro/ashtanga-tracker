import prisma from "../../lib/prisma.js";
import { buildWeeklyInsightsLlmInput } from "../../lib/insights/llmShapes.js";

import {
    PAIN_SCALE_METADATA,
    WEEKLY_INSIGHT_WEEKLY_LIMIT,
    HttpError,
    buildWeeklyComparison,
    buildWeeklyRollup,
    getGenerationQuotaWindow,
    painSeverityFromAverage,
    resolveWeeklyWindow,
    runJsonInsightPrompt,
    toJson,
    toPainSeverityStats,
    type WeeklyInsightsBody,
} from "./shared.js";

export async function getWeeklyInsightsResponse(userId: string, body: WeeklyInsightsBody) {
    const window = resolveWeeklyWindow(body);

    const cachedInsight = await prisma.weeklyInsight.findFirst({
        where: {
            userId,
            weekStart: window.currentStart,
            weekEndExclusive: window.currentEndExclusive,
            weekStartsOn: body.weekStartsOn,
            timeZone: body.timeZone,
            includeDrafts: body.includeDrafts,
        },
        orderBy: { createdAt: "desc" },
    });

    if (cachedInsight) {
        console.log('Already have cached insight for this window, returning it. Insight ID:', cachedInsight.id); //Comment out later
        return {
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
            computed: cachedInsight.computed,
            llmInput: cachedInsight.llmInput,
            ai: cachedInsight.ai,
            meta: {
                source: "cache",
                insightId: cachedInsight.id,
                createdAt: cachedInsight.createdAt.toISOString(),
                quota: {
                    limit: WEEKLY_INSIGHT_WEEKLY_LIMIT,
                    consumed: null,
                    note: "Cached report reused; no new generation consumed.",
                },
            },
        };
    }

    const quotaWindow = getGenerationQuotaWindow();
    const generatedThisWeek = await prisma.weeklyInsight.count({
        where: {
            userId,
            createdAt: {
                gte: quotaWindow.start,
                lt: quotaWindow.endExclusive,
            },
        },
    });

    if (generatedThisWeek >= WEEKLY_INSIGHT_WEEKLY_LIMIT) {
        throw new HttpError(
            429,
            "Weekly insight generation limit reached for this week.",
            {
                error: "Weekly insight generation limit reached for this week.",
                quota: {
                    limit: WEEKLY_INSIGHT_WEEKLY_LIMIT,
                    consumed: generatedThisWeek,
                    remaining: 0,
                    resetsAt: quotaWindow.endExclusive.toISOString(),
                },
            },
        );
    }

    const [currentSessions, previousSessions] = await Promise.all([
        prisma.practiceSession.findMany({
            where: {
                userId,
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
                userId,
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

    const computedPayload = {
        currentWeek: currentRollup,
        previousWeek: previousRollup,
        comparison,
    };

    const storedInsight = await prisma.weeklyInsight.create({
        data: {
            userId,
            weekStart: window.currentStart,
            weekEndExclusive: window.currentEndExclusive,
            weekStartsOn: body.weekStartsOn,
            timeZone: body.timeZone,
            includeDrafts: body.includeDrafts,
            computed: toJson(computedPayload),
            llmInput: toJson(llmInput),
            ai: toJson(aiResult.parsed),
            model: aiResult.model,
        },
    });

    return {
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
        computed: computedPayload,
        llmInput,
        ai: aiResult.parsed,
        debug: { model: aiResult.model, raw: aiResult.raw },
        meta: {
            source: "generated",
            insightId: storedInsight.id,
            createdAt: storedInsight.createdAt.toISOString(),
            quota: {
                limit: WEEKLY_INSIGHT_WEEKLY_LIMIT,
                consumed: generatedThisWeek + 1,
                remaining: Math.max(0, WEEKLY_INSIGHT_WEEKLY_LIMIT - (generatedThisWeek + 1)),
                resetsAt: quotaWindow.endExclusive.toISOString(),
            },
        },
    };
}
