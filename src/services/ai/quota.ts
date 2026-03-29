import prisma from "../../lib/prisma.js";
import {
    POSE_INSIGHT_WEEKLY_LIMIT,
    WEEKLY_INSIGHT_WEEKLY_LIMIT,
    getGenerationQuotaWindow,
} from "./shared.js";

export async function getAiQuotaResponse(userId: string) {
    const window = getGenerationQuotaWindow();

    const [weeklyConsumed, poseConsumed] = await Promise.all([
        prisma.weeklyInsight.count({
            where: {
                userId,
                createdAt: {
                    gte: window.start,
                    lt: window.endExclusive,
                },
            },
        }),
        prisma.poseInsight.count({
            where: {
                userId,
                createdAt: {
                    gte: window.start,
                    lt: window.endExclusive,
                },
            },
        }),
    ]);

    const weeklyRemaining = Math.max(0, WEEKLY_INSIGHT_WEEKLY_LIMIT - weeklyConsumed);
    const poseRemaining = Math.max(0, POSE_INSIGHT_WEEKLY_LIMIT - poseConsumed);

    return {
        window: {
            start: window.start.toISOString(),
            endExclusive: window.endExclusive.toISOString(),
        },
        quota: {
            weeklyInsights: {
                limit: WEEKLY_INSIGHT_WEEKLY_LIMIT,
                consumed: weeklyConsumed,
                remaining: weeklyRemaining,
                isMet: weeklyRemaining === 0,
                resetsAt: window.endExclusive.toISOString(),
            },
            poseInsights: {
                limit: POSE_INSIGHT_WEEKLY_LIMIT,
                consumed: poseConsumed,
                remaining: poseRemaining,
                isMet: poseRemaining === 0,
                resetsAt: window.endExclusive.toISOString(),
            },
        },
        meta: {
            computedAt: new Date().toISOString(),
            source: "derived_from_insight_records",
        },
    };
}
