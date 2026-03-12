import prisma from "../../../lib/prisma.js";
import { Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { z } from "zod";
import { SequenceGroup } from "@prisma/client";
import { METRIC_KEYS, type MetricKey } from "../../../lib/constants.js";
import { metricStatsMap, summarizeNumericStats } from "../../../lib/insights/helpers.js";

const REQUIRED_METRICS = METRIC_KEYS;

function computeCardOverall(sc: Record<(typeof REQUIRED_METRICS)[number], number | null>) {
    const nums = REQUIRED_METRICS
        .map((k) => sc[k])
        .filter((v): v is number => typeof v === "number");
    if (!nums.length) return null;
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    return Math.round(avg * 100) / 100; // 2 decimals
}

// GET /poses?segment=PRIMARY (optional)
const posesQuerySchema = z.object({
    segment: z.enum(SequenceGroup).optional(),
});

/** Query: /session?limit=20&cursor=<token> */
const qSchema = z.object({
    limit: z.coerce.number().int().positive().max(100).default(20),
    cursor: z.string().optional(), // base64url token
});

type CursorPayload = { d: string; id: string }; // d = ISO date string of last item

function encodeCursor(p: CursorPayload) {
    return Buffer.from(JSON.stringify(p)).toString('base64url');
}
function decodeCursor(s: string | undefined): CursorPayload | undefined {
    if (!s) return undefined;
    try {
        return JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as CursorPayload;
    } catch {
        return undefined;
    }
}

export const getSessionById = async (req: Request, res: Response) => {
    const client = req.user as { id: string } | undefined;
    if (!client?.id) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;

    const session = await prisma.practiceSession.findFirst({
        where: { id, userId: client.id },
        select: {
            id: true,
            status: true,
            date: true,
            label: true,
            notes: true,
            overallScore: true,
            scoreCards: {
                orderBy: { orderInSession: 'asc' },
                select: {
                    id: true,
                    side: true,
                    skipped: true,
                    overallScore: true,
                    ease: true,
                    comfort: true,
                    stability: true,
                    pain: true,
                    breath: true,
                    focus: true,
                    pose: {
                        select: { sanskritName: true, sequenceGroup: true },
                    },
                },
            },
        },
    });

    if (!session) return res.status(404).json({ error: "Session not found" });

    const scoreCards = session.scoreCards.map((c) => {
        const missingAny =
            !c.skipped && REQUIRED_METRICS.some((k) => c[k] == null);

        const isComplete = c.skipped ? true : !missingAny;

        return {
            id: c.id,
            side: c.side,
            skipped: c.skipped,
            overallScore: c.overallScore,
            isComplete,
            pose: c.pose,
        };
    });

    const firstIncomplete = scoreCards.find((c) => !c.isComplete)?.id ?? null;

    const summary = {
        total: scoreCards.length,
        complete: scoreCards.filter((c) => c.isComplete).length,
        incomplete: scoreCards.filter((c) => !c.isComplete).length,
        firstIncompleteScoreCardId: firstIncomplete,
    };

    return res.json({
        session: {
            id: session.id,
            status: session.status,
            notes: session.notes,
            date: session.date.toISOString(),
            overallScore: session.overallScore,
            summary,
            scoreCards,
        },
    });
};

type StatsCardRow = {
    id: string;
    orderInSession: number;
    segment: string | null;
    side: string | null;
    skipped: boolean;
    overallScore: number | null;
    ease: number | null;
    comfort: number | null;
    stability: number | null;
    pain: number | null;
    breath: number | null;
    focus: number | null;
    pose: {
        id: string;
        slug: string;
        sanskritName: string;
        sequenceGroup: SequenceGroup;
    };
};

function buildGroupedStats(rows: StatsCardRow[], groupKey: (row: StatsCardRow) => string) {
    const grouped = new Map<string, StatsCardRow[]>();

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

export async function getSessionStats(req: Request, res: Response) {
    const client = req.user as { id: string } | undefined;
    if (!client?.id) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing session id" });

    const session = await prisma.practiceSession.findFirst({
        where: { id, userId: client.id },
        select: {
            id: true,
            status: true,
            date: true,
            label: true,
            practiceType: true,
            durationMinutes: true,
            overallScore: true,
            scoreCards: {
                orderBy: { orderInSession: "asc" },
                select: {
                    id: true,
                    orderInSession: true,
                    segment: true,
                    side: true,
                    skipped: true,
                    overallScore: true,
                    ease: true,
                    comfort: true,
                    stability: true,
                    pain: true,
                    breath: true,
                    focus: true,
                    pose: {
                        select: {
                            id: true,
                            slug: true,
                            sanskritName: true,
                            sequenceGroup: true,
                        },
                    },
                },
            },
        },
    });

    if (!session) return res.status(404).json({ error: "Session not found" });

    const scoreCards: StatsCardRow[] = session.scoreCards.map((card) => ({
        id: card.id,
        orderInSession: card.orderInSession,
        segment: card.segment,
        side: card.side,
        skipped: card.skipped,
        overallScore: card.overallScore,
        ease: card.ease,
        comfort: card.comfort,
        stability: card.stability,
        pain: card.pain,
        breath: card.breath,
        focus: card.focus,
        pose: card.pose,
    }));

    const activeCards = scoreCards.filter((card) => !card.skipped);

    const completeCount = scoreCards.filter((card) =>
        card.skipped || REQUIRED_METRICS.every((metric) => card[metric] != null),
    ).length;

    const incompleteCount = scoreCards.length - completeCount;

    const bySegment = buildGroupedStats(
        activeCards,
        (card) => card.segment ?? "UNKNOWN",
    );

    const bySide = buildGroupedStats(
        activeCards,
        (card) => card.side ?? "NA",
    );

    const metrics = metricStatsMap(activeCards, REQUIRED_METRICS);

    const responseShape: {
        session: {
            id: string;
            status: string;
            date: string;
            label: string | null;
            practiceType: string | null;
            durationMinutes: number | null;
            overallScore: number | null;
        };
        summary: {
            totalScoreCards: number;
            activeScoreCards: number;
            skippedScoreCards: number;
            completeScoreCards: number;
            incompleteScoreCards: number;
        };
        statistics: {
            overallScore: ReturnType<typeof summarizeNumericStats>;
            metrics: Record<MetricKey, ReturnType<typeof summarizeNumericStats>>;
            bySegment: ReturnType<typeof buildGroupedStats>;
            bySide: ReturnType<typeof buildGroupedStats>;
        };
    } = {
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
            activeScoreCards: activeCards.length,
            skippedScoreCards: scoreCards.length - activeCards.length,
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
    const client = req.user as { id: string } | undefined;
    if (!client?.id) return res.status(401).json({ message: 'Unauthorized' });

    const { limit, cursor } = qSchema.parse(req.query);
    const cur = decodeCursor(cursor);

    // Stable ordering + keyset window
    const where: Prisma.PracticeSessionWhereInput = { userId: client.id };
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
        orderBy: [{ date: 'desc' }, { id: 'desc' }], // tie-breaker for stability
        take: limit + 1, // overfetch to detect next page
        select: {
            id: true,
            date: true,
            label: true,
            status: true,
            overallScore: true,
            energyLevel: true,
            mood: true,
            practiceType: true
        },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];

    const nextCursor = hasMore
        ? encodeCursor({ d: last.date.toISOString(), id: last.id })
        : null;

    // Shape your FE expects
    res.json({ items, nextCursor });
}

export const publishSession = async (req: Request, res: Response) => {
    const client = req.user as { id: string } | undefined;
    if (!client?.id) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing session id" });

    try {
        const result = await prisma.$transaction(async (tx) => {
            const session = await tx.practiceSession.findFirst({
                where: { id, userId: client.id },
                select: { id: true, status: true },
            });

            if (!session) {
                return { kind: "not_found" as const };
            }

            // If currently published -> unpublish (no validation)
            if (session.status === "PUBLISHED") {
                const updated = await tx.practiceSession.update({
                    where: { id: session.id },
                    data: { status: "DRAFT" },
                    select: { id: true, status: true, date: true, overallScore: true },
                });
                return { kind: "ok" as const, session: updated };
            }

            // Otherwise, publishing from DRAFT -> PUBLISHED
            // 1) Validate completeness: any required metric null on any unskipped card?
            const incomplete = await tx.scoreCard.findFirst({
                where: {
                    sessionId: session.id,
                    skipped: false,
                    OR: REQUIRED_METRICS.map((k) => ({ [k]: null })),
                },
                select: {
                    id: true,
                    side: true,
                    pose: { select: { sanskritName: true, slug: true } },
                    ease: true,
                    comfort: true,
                    stability: true,
                    pain: true,
                    breath: true,
                    focus: true,
                },
            });

            if (incomplete) {
                const missing = REQUIRED_METRICS.filter((k) => incomplete[k] == null);
                return {
                    kind: "incomplete" as const,
                    error: {
                        message: "Cannot publish: some scorecards are incomplete.",
                        scoreCardId: incomplete.id,
                        pose: incomplete.pose,
                        side: incomplete.side,
                        missing,
                    },
                };
            }

            // 2) Recompute overallScore for all unskipped cards (safe + idempotent)
            const cards = await tx.scoreCard.findMany({
                where: { sessionId: session.id, skipped: false },
                select: {
                    id: true,
                    ease: true,
                    comfort: true,
                    stability: true,
                    pain: true,
                    breath: true,
                    focus: true,
                },
            });

            for (const c of cards) {
                const overallScore = computeCardOverall(c);
                await tx.scoreCard.update({
                    where: { id: c.id },
                    data: { overallScore },
                    select: { id: true },
                });
            }

            // 3) Compute + store session overallScore
            const agg = await tx.scoreCard.aggregate({
                where: { sessionId: session.id, skipped: false, overallScore: { not: null } },
                _avg: { overallScore: true },
            });

            const updated = await tx.practiceSession.update({
                where: { id: session.id },
                data: {
                    status: "PUBLISHED",
                    overallScore: agg._avg.overallScore ?? null,
                },
                select: { id: true, status: true, date: true, overallScore: true },
            });

            return { kind: "ok" as const, session: updated };
        });

        if (result.kind === "not_found") return res.status(404).json({ error: "Session not found or no permission" });
        if (result.kind === "incomplete") return res.status(409).json(result.error);

        return res.json({ session: result.session });
    } catch (err) {
        console.error("publishSession error", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};


export async function listPosesBySegment(req: Request, res: Response) {
    try {
        const q = posesQuerySchema.parse(req.query);
        const where = q.segment ? { sequenceGroup: q.segment } : {};
        const poses = await prisma.pose.findMany({
            where,
            orderBy: [{ sequenceGroup: 'asc' }, { orderInGroup: 'asc' }, { sanskritName: 'asc' }],
            select: { id: true, slug: true, sanskritName: true, englishName: true, sequenceGroup: true, isTwoSided: true, orderInGroup: true },
        });
        res.json({ count: poses.length, poses });
    } catch (err: any) {
        res.status(400).json({ error: err?.message ?? 'Bad Request' });
    }
}

export async function deleteSession(req: Request, res: Response) {
    const client = req.user as { id: string } | undefined;
    if (!client?.id) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing session id" });

    try {
        const deleted = await prisma.practiceSession.deleteMany({
            where: { id, userId: client.id },
        });

        if (deleted.count === 0) {
            return res.status(404).json({ error: "Session not found or no permission" });
        }

        return res.json({ message: "Session deleted" });
    } catch (err) {
        console.error("deleteSession error", err);
        return res.status(500).json({ error: "Internal server error" });
    }
}
