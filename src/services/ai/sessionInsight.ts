import prisma from "../../lib/prisma.js";
import { type MetricKey } from "../../lib/constants.js";

import {
    REQUIRED_METRICS,
    PAIN_SCALE_METADATA,
    HttpError,
    avg,
    getSampleConfidence,
    painSeverityFromAverage,
    painSeverityFromScore,
    runJsonInsightPrompt,
    type SessionAiResponse,
} from "./shared.js";

export async function getSessionAiInsightResponse(userId: string, sessionId: string): Promise<SessionAiResponse> {
    const session = await prisma.practiceSession.findFirst({
        where: { id: sessionId, userId },
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
                    scored: true,
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

    if (!session) {
        throw new HttpError(404, "Session not found");
    }

    const scoreCards = session.scoreCards.map((c) => {
        const missingAny =
            c.scored && !c.skipped && REQUIRED_METRICS.some((k) => c[k] == null);

        return {
            id: c.id,
            side: c.side,
            scored: c.scored,
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

    const activeCards = scoreCards.filter((c) => c.scored && !c.skipped);

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
        scoredTotal: scoreCards.filter((c) => c.scored).length,
        unscoredTotal: scoreCards.filter((c) => !c.scored).length,
        analyzedScoredTotal: activeCards.length,
        skippedScoredTotal: scoreCards.filter((c) => c.scored && c.skipped).length,
        sampleConfidence: getSampleConfidence(activeCards.length),
    };

    const trackingCoverage = {
        practicedCardCount: summary.total,
        scoredCardCount: summary.scoredTotal,
        analyzedScoredCardCount: summary.analyzedScoredTotal,
        skippedScoredCardCount: summary.skippedScoredTotal,
        scoringCoverageRate: summary.total > 0 ? Math.round((summary.scoredTotal / summary.total) * 10000) / 10000 : null,
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
        trackingCoverage,
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
            scored: c.scored,
            skipped: c.skipped,
            overallScore: c.overallScore,
            metrics: {
                ...c.metrics,
                painSeverity: painSeverityFromScore(c.metrics.pain),
            },
            notes: c.notes,
        })),
    };

    const systemPrompt = `
You are a careful yoga practice review assistant.
Analyze one practice session.

Return STRICT JSON with keys:
- summary: string (2-4 sentences)
- insights: string[] (3-6 bullets)
- redFlags: string[] (only if supported by pain/notes patterns; otherwise empty)
- followUps: string[] (questions the user could answer next time)

Constraints:
- No medical diagnosis.
- Performance metrics are computed from scored cards only (scored=true and skipped=false).
- Unscored cards represent intentional tracking opt-out and should not be framed as non-compliance.
- Pain score is inverted: 10 = least pain (best), 1 = most pain (worst).
- Treat lower pain score (or higher painSeverity) as higher pain concern.
- If pain score is low or notes suggest injury, recommend caution and professional guidance.
`.trim();

    const completion = await runJsonInsightPrompt(
        systemPrompt,
        payloadForModel,
        { summary: "Failed to parse model output", insights: [], redFlags: [], followUps: [] },
    );

    return {
        session: {
            id: session.id,
            status: session.status,
            date: session.date.toISOString(),
            overallScore: session.overallScore,
            summary,
        },
        computed: { metricAverages, painHotSpots, trackingCoverage },
        ai: completion.parsed,
        debug: { model: completion.model, raw: completion.raw },
    };
}
