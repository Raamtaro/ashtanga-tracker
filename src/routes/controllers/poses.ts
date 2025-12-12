import prisma from "../../lib/prisma";
import { Prisma, SequenceGroup } from "@prisma/client";
import { Request, Response } from "express";
import { z } from "zod";
import { ALLOWED_METRICS, type AllowedMetric, type PoseTrendResponse, type TrendPoint } from "../../types/trend";


const querySchema = z.object({
    fields: z.string().optional().transform((s) =>
        s ? s.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean) : undefined
    ).refine(
        (arr) => !arr || arr.every((f) => (ALLOWED_METRICS as readonly string[]).includes(f)),
        { message: `fields must be a comma-separated list of: ${ALLOWED_METRICS.join(", ")}` }
    ),
    days: z.union([z.literal("all"), z.coerce.number().int().positive()]).optional().default(90),
    side: z.enum(["LEFT", "RIGHT", "NA", "BOTH", "ALL"]).optional(),
    includeSkipped: z.coerce.boolean().optional().default(false),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
}).refine((q) => (q.from && q.to ? q.from <= q.to : true), { message: "`from` must be <= `to`" });

const posesQuerySchema = z.object({
    segment: z.enum(SequenceGroup).optional(),
});

function normalizeFromTo(qFrom?: Date, qTo?: Date) {
    let from: Date | undefined;
    let to: Date | undefined;

    if (qFrom && !Number.isNaN(qFrom.valueOf())) {
        from = new Date(Date.UTC(qFrom.getUTCFullYear(), qFrom.getUTCMonth(), qFrom.getUTCDate(), 0, 0, 0, 0));
    }
    if (qTo && !Number.isNaN(qTo.valueOf())) {
        // exclusive upper bound: next midnight UTC
        to = new Date(Date.UTC(qTo.getUTCFullYear(), qTo.getUTCMonth(), qTo.getUTCDate(), 0, 0, 0, 0) + 24 * 60 * 60 * 1000);
    }
    return { from, to };
}


export const getAllPoses = async (req: Request, res: Response) => {
    const allPoses = await prisma.pose.findMany(
        {
            select: {
                // id: true,
                // sanskritName: true,
                sequenceGroup: true,
                orderInGroup: true,
                slug: true
            }
        }
    )

    if (allPoses.length === 0) {
        return res.status(404).json({ message: "No poses found." });
    }

    res.json(allPoses);
}

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


export const getPoseById = async (req: Request, res: Response) => { //This will be used to trend metrics for a specific pose. User should be able to input which metrics they want to trend (can select multiple).
    const { id } = req.params;

    const pose = await prisma.pose.findUnique({
        where: { id: id },
        select: {
            englishName: true,
            sanskritName: true,
            scoreCards: true
        }
    });

    if (!pose) {
        return res.status(404).json({ message: "Pose not found." });
    }

    res.json(pose);
}

export const trendPoseMetrics = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const q = querySchema.parse(req.query);

        // metrics to return
        const metrics: AllowedMetric[] = (q.fields as AllowedMetric[] | undefined) ?? [...ALLOWED_METRICS];

        // time window
        let { from, to } = normalizeFromTo(q.from, q.to);
        if (!from && !to && q.days !== "all") {
            const end = new Date(); // now
            const start = new Date(end.getTime() - q.days * 24 * 60 * 60 * 1000);
            // use created window directly (no normalize — it already has time)
            from = start;
            to = end;
        }

        // pose header
        const pose = await prisma.pose.findUnique({
            where: { id },
            select: { id: true, slug: true, sanskritName: true, englishName: true },
        });
        if (!pose) return res.status(404).json({ message: "Pose not found." });

        // resolve sessionIds inside window (scalar filter, cannot be ignored)
        let sessionIds: string[] | undefined;
        if (from || to) {
            const sessions = await prisma.practiceSession.findMany({
                where: {
                    ...(from ? { date: { gte: from } } : {}),
                    ...(to ? { date: { lt: to } } : {}), // exclusive upper bound
                },
                select: { id: true, date: true },
                orderBy: { date: "asc" },
            });
            sessionIds = sessions.map(s => s.id);

            // If nothing in window → return empty points fast
            if (!sessionIds.length) {
                const resp: PoseTrendResponse = {
                    pose,
                    metrics,
                    window: { from: from?.toISOString(), to: to?.toISOString() },
                    points: [],
                };
                return res.json(resp);
            }
        }

        // build scalar-only where for scorecards
        const where: Prisma.ScoreCardWhereInput = {
            poseId: id,
            ...(sessionIds ? { sessionId: { in: sessionIds } } : {}),
            ...(q.includeSkipped ? {} : { skipped: false }),
            ...(q.side && q.side !== "ALL"
                ? { side: q.side === "BOTH" ? { in: ["LEFT", "RIGHT"] } : q.side }
                : {}),
        };

        // dynamic select for requested metrics
        const metricSelect = Object.fromEntries(metrics.map((m) => [m, true])) as Pick<
            Prisma.ScoreCardSelect,
            AllowedMetric
        >;

        const cards = await prisma.scoreCard.findMany({
            where,
            select: {
                id: true,
                createdAt: true,
                side: true,
                segment: true,
                orderInSession: true,
                skipped: true,
                session: { select: { date: true } },
                ...metricSelect,
            },
            orderBy: [{ session: { date: "asc" } }, { orderInSession: "asc" }],
        });

        // last-ditch safety: filter by window in memory too (should be no-ops if DB filtered correctly)
        const filtered = (from || to)
            ? cards.filter(c => {
                const d = c.session!.date;
                return (!from || d >= from) && (!to || d < to);
            })
            : cards;

        const points: TrendPoint[] = filtered.map((c) => ({
            scoreCardId: c.id,
            sessionDate: c.session!.date.toISOString(),
            createdAt: c.createdAt.toISOString(),
            side: c.side ?? null,
            segment: c.segment ?? null,
            orderInSession: c.orderInSession,
            skipped: c.skipped,
            values: Object.fromEntries(metrics.map((m) => [m, (c as any)[m] ?? null])) as TrendPoint["values"],
        }));

        const resp: PoseTrendResponse = {
            pose,
            metrics,
            window: { from: from?.toISOString(), to: to?.toISOString() },
            points,
        };
        res.json(resp);
    } catch (err: any) {
        res.status(400).json({ error: err?.message ?? "Bad Request" });
    }
};