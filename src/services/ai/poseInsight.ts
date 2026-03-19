import prisma from "../../lib/prisma.js";
import { buildPoseInsightsLlmInput, type PoseInsightsLlmInput } from "../../lib/insights/llmShapes.js";
import {
    DAY_PARTS,
    extractKeywordCounts,
    isoDate,
    linearRegressionSlope,
    metricStatsMap,
    summarizeNumericStats,
} from "../../lib/insights/helpers.js";

import {
    PAIN_SCALE_METADATA,
    POSE_INSIGHT_WEEKLY_LIMIT,
    REQUIRED_METRICS,
    HttpError,
    avg,
    dayPartForDate,
    getGenerationQuotaWindow,
    painSeverityFromAverage,
    resolvePoseWindow,
    runJsonInsightPrompt,
    toJson,
    toPainSeverityStats,
    type PoseInsightsBody,
} from "./shared.js";

export async function getPoseInsightsResponse(userId: string, poseIdParam: string | undefined, body: PoseInsightsBody) {
    const window = resolvePoseWindow(body);
    const now = new Date();

    const pose = await prisma.pose.findFirst({
        where: poseIdParam ? { id: poseIdParam } : { slug: body.poseSlug },
        select: {
            id: true,
            slug: true,
            sanskritName: true,
            englishName: true,
        },
    });

    if (!pose) {
        throw new HttpError(404, "Pose not found");
    }

    const cachedInsight = await prisma.poseInsight.findFirst({
        where: {
            userId,
            poseId: pose.id,
            timeframeStart: window.start,
            timeframeEndExclusive: window.endExclusive,
            timeZone: body.timeZone,
        },
        orderBy: { createdAt: "desc" },
    });

    if (cachedInsight) {
        return {
            pose,
            timeframe: {
                start: window.start.toISOString(),
                endExclusive: window.endExclusive.toISOString(),
                totalDays: window.totalDays,
            },
            computed: cachedInsight.computed,
            llmInput: cachedInsight.llmInput,
            ai: cachedInsight.ai,
            meta: {
                source: "cache",
                insightId: cachedInsight.id,
                createdAt: cachedInsight.createdAt.toISOString(),
                quota: {
                    limit: POSE_INSIGHT_WEEKLY_LIMIT,
                    consumed: null,
                    note: "Cached report reused; no new generation consumed.",
                },
            },
        };
    }

    const recentCacheStart = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    const recentPoseInsight = await prisma.poseInsight.findFirst({
        where: {
            userId,
            poseId: pose.id,
            createdAt: {
                gte: recentCacheStart,
            },
        },
        orderBy: { createdAt: "desc" },
    });

    if (recentPoseInsight) {
        const nextPoseEligibleAt = new Date(recentPoseInsight.createdAt.getTime() + (7 * 24 * 60 * 60 * 1000));

        return {
            pose,
            timeframe: {
                start: recentPoseInsight.timeframeStart.toISOString(),
                endExclusive: recentPoseInsight.timeframeEndExclusive.toISOString(),
                totalDays: recentPoseInsight.totalDays,
            },
            computed: recentPoseInsight.computed,
            llmInput: recentPoseInsight.llmInput,
            ai: recentPoseInsight.ai,
            meta: {
                source: "pose_recent_cache",
                insightId: recentPoseInsight.id,
                createdAt: recentPoseInsight.createdAt.toISOString(),
                warning: "Recent pose insight reused; no new generation consumed.",
                request: {
                    timeframe: {
                        start: window.start.toISOString(),
                        endExclusive: window.endExclusive.toISOString(),
                        totalDays: window.totalDays,
                    },
                    timeZone: body.timeZone,
                },
                nextPoseEligibleAt: nextPoseEligibleAt.toISOString(),
                quota: {
                    limit: POSE_INSIGHT_WEEKLY_LIMIT,
                    consumed: null,
                    note: "Cached report reused; no new generation consumed.",
                },
            },
        };
    }

    const quotaWindow = getGenerationQuotaWindow();
    const generatedThisWeek = await prisma.poseInsight.count({
        where: {
            userId,
            createdAt: {
                gte: quotaWindow.start,
                lt: quotaWindow.endExclusive,
            },
        },
    });

    if (generatedThisWeek >= POSE_INSIGHT_WEEKLY_LIMIT) {
        throw new HttpError(
            429,
            "Pose insight generation limit reached for this week.",
            {
                error: "Pose insight generation limit reached for this week.",
                quota: {
                    limit: POSE_INSIGHT_WEEKLY_LIMIT,
                    consumed: generatedThisWeek,
                    remaining: 0,
                    resetsAt: quotaWindow.endExclusive.toISOString(),
                },
            },
        );
    }

    const cards = await prisma.scoreCard.findMany({
        where: {
            poseId: pose.id,
            skipped: false,
            session: {
                userId,
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

    const storedInsight = await prisma.poseInsight.create({
        data: {
            userId,
            poseId: pose.id,
            timeframeStart: window.start,
            timeframeEndExclusive: window.endExclusive,
            totalDays: window.totalDays,
            timeZone: body.timeZone,
            computed: toJson(llmInput.summary),
            llmInput: toJson(llmInput),
            ai: toJson(aiResult.parsed),
            model: aiResult.model,
        },
    });

    return {
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
        meta: {
            source: "generated",
            insightId: storedInsight.id,
            createdAt: storedInsight.createdAt.toISOString(),
            quota: {
                limit: POSE_INSIGHT_WEEKLY_LIMIT,
                consumed: generatedThisWeek + 1,
                remaining: Math.max(0, POSE_INSIGHT_WEEKLY_LIMIT - (generatedThisWeek + 1)),
                resetsAt: quotaWindow.endExclusive.toISOString(),
            },
        },
    };
}
