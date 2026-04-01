import prisma from "../../../lib/prisma.js";
import { Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { metricStatsMap, summarizeNumericStats } from "../../../lib/insights/helpers.js";
import type {
    GetAllSessionsResponse,
    GetSessionByIdResponse,
    GetSessionStatsResponse,
} from "../../../types/session.js";
import { sendSessionNotFound } from "./basic.errors.js";
import {
    REQUIRED_METRICS,
    buildSessionViewerSummary,
    decodeCursor,
    encodeCursor,
    qSchema,
    requireSessionIdParam,
    requireUserId,
    toSessionViewerCards,
} from "./basic.helpers.js";
import {
    SESSION_LIST_SELECT,
    SESSION_STATS_SELECT,
    SESSION_VIEW_SELECT,
} from "./basic.selects.js";

type SessionStatsCardRow = Prisma.PracticeSessionGetPayload<{
    select: typeof SESSION_STATS_SELECT;
}>["scoreCards"][number];

function buildGroupedStats(
    rows: SessionStatsCardRow[],
    groupKey: (row: SessionStatsCardRow) => string,
): GetSessionStatsResponse["statistics"]["bySegment"] {
    const grouped = new Map<string, SessionStatsCardRow[]>();

    for (const row of rows) {
        const key = groupKey(row);
        const bucket = grouped.get(key) ?? [];
        bucket.push(row);
        grouped.set(key, bucket);
    }

    return [...grouped.entries()]
        .map(([key, bucket]) => ({
            key,
            count: bucket.length,
            overallScore: summarizeNumericStats(bucket.map((row) => row.overallScore)),
            metrics: metricStatsMap(bucket, REQUIRED_METRICS),
        }))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export const getSessionById = async (req: Request, res: Response) => {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const sessionId = requireSessionIdParam(req, res);
    if (!sessionId) return;

    const session = await prisma.practiceSession.findFirst({
        where: { id: sessionId, userId },
        select: SESSION_VIEW_SELECT,
    });

    if (!session) return sendSessionNotFound(res);

    const practicedCards = toSessionViewerCards(session.scoreCards, session.status);
    const scoredCards = practicedCards.filter((card) => card.scored);
    const summary = buildSessionViewerSummary(practicedCards);

    const responseShape: GetSessionByIdResponse = {
        session: {
            id: session.id,
            status: session.status,
            label: session.label,
            practiceType: session.practiceType,
            durationMinutes: session.durationMinutes,
            mood: session.mood,
            energyLevel: session.energyLevel,
            notes: session.notes,
            date: session.date.toISOString(),
            overallScore: session.overallScore,
            summary,
            practicedCards,
            scoredCards,
        },
    };

    return res.json(responseShape);
};

export async function getSessionStats(req: Request, res: Response) {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const sessionId = requireSessionIdParam(req, res);
    if (!sessionId) return;

    const session = await prisma.practiceSession.findFirst({
        where: { id: sessionId, userId },
        select: SESSION_STATS_SELECT,
    });

    if (!session) return sendSessionNotFound(res);

    const scoreCards: SessionStatsCardRow[] = session.scoreCards;
    const scoredCards = scoreCards.filter((card) => card.scored);
    const activeCards = scoredCards.filter((card) => !card.skipped);

    const completeCount = scoredCards.filter((card) =>
        card.skipped || REQUIRED_METRICS.every((metric) => card[metric] != null),
    ).length;

    const incompleteCount = scoredCards.length - completeCount;

    const bySegment = buildGroupedStats(
        activeCards,
        (card) => card.segment ?? "UNKNOWN",
    );

    const bySide = buildGroupedStats(
        activeCards,
        (card) => card.side ?? "NA",
    );

    const metrics = metricStatsMap(activeCards, REQUIRED_METRICS);

    const responseShape: GetSessionStatsResponse = {
        session: {
            id: session.id,
            status: session.status,
            date: session.date.toISOString(),
            label: session.label,
            practiceType: session.practiceType,
            durationMinutes: session.durationMinutes,
            overallScore: session.overallScore,
        },
        summary: {
            totalScoreCards: scoreCards.length,
            scoredScoreCards: scoredCards.length,
            unscoredScoreCards: scoreCards.length - scoredCards.length,
            activeScoreCards: activeCards.length,
            skippedScoreCards: scoredCards.filter((card) => card.skipped).length,
            completeScoreCards: completeCount,
            incompleteScoreCards: incompleteCount,
        },
        statistics: {
            overallScore: summarizeNumericStats(activeCards.map((card) => card.overallScore)),
            metrics,
            bySegment,
            bySide,
        },
    };

    return res.json(responseShape);
}

export async function getAllSessions(req: Request, res: Response) {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const { limit, cursor } = qSchema.parse(req.query);
    const cur = decodeCursor(cursor);

    // Stable ordering + keyset window
    const where: Prisma.PracticeSessionWhereInput = { userId };
    if (cur) {
        const d = new Date(cur.d);
        // everything strictly "after" our cursor in (date desc, id desc) order:
        // i.e. rows with date < d, OR same date and id < cursor.id
        where.OR = [
            { date: { lt: d } },
            { AND: [{ date: d }, { id: { lt: cur.id } }] },
        ];
    }

    const rows = await prisma.practiceSession.findMany({
        where,
        orderBy: [{ date: "desc" }, { id: "desc" }], // tie-breaker for stability
        take: limit + 1, // overfetch to detect next page
        select: SESSION_LIST_SELECT,
    });

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];

    const nextCursor = hasMore && last
        ? encodeCursor({ d: last.date.toISOString(), id: last.id })
        : null;

    const items = pageRows.map((row) => ({
        ...row,
        date: row.date.toISOString(),
    }));

    const responseShape: GetAllSessionsResponse = { items, nextCursor };
    return res.json(responseShape);
}
