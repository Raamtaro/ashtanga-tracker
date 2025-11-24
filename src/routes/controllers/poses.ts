import prisma from "../../lib/prisma";
import { Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { z } from "zod";
import { ALLOWED_METRICS, type AllowedMetric, type PoseTrendResponse, type TrendPoint } from "../../types/trend";


const querySchema = z.object({
    fields: z
        .string()
        .optional()
        .transform((s) => {
            if (!s) return undefined;
            return s
                .split(',')
                .map((x) => x.trim().toLowerCase())
                .filter(Boolean) as string[];
        })
        .refine(
            (arr) => !arr || arr.every((f) => (ALLOWED_METRICS as readonly string[]).includes(f)),
            { message: `fields must be a comma-separated list of: ${ALLOWED_METRICS.join(', ')}` }
        ),
    days: z.union([z.literal('all'), z.coerce.number().int().positive()]).optional().default(90),
    side: z.enum(['LEFT', 'RIGHT', 'NA', 'BOTH', 'ALL']).optional(),
    includeSkipped: z.coerce.boolean().optional().default(false),
    // power users can also pass explicit from/to; if present, they override `days`
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
}).refine((q) => (q.from && q.to ? q.from <= q.to : true), {
    message: '`from` must be <= `to`',
});


export const getAllPoses = async (req: Request, res: Response) => {
    const allPoses = await prisma.pose.findMany(
        {
            select: {
                id: true,
                sanskritName: true,
                sequenceGroup: true
            }
        }
    )

    if (allPoses.length === 0) {
        return res.status(404).json({ message: "No poses found." });
    }

    res.json(allPoses);
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

        // 1) Resolve which metrics to return
        const metrics: AllowedMetric[] = (q.fields as AllowedMetric[] | undefined) ?? [...ALLOWED_METRICS];

        // 2) Resolve time window
        let from: Date | undefined = q.from;
        let to: Date | undefined = q.to;

        if (!from && !to && q.days !== 'all') {
            to = new Date();
            from = new Date(to.getTime() - q.days * 24 * 60 * 60 * 1000);
        }

        // 3) Fetch pose basics
        const pose = await prisma.pose.findUnique({
            where: { id },
            select: { id: true, slug: true, sanskritName: true, englishName: true },
        });
        if (!pose) return res.status(404).json({ message: 'Pose not found.' });

        // 4) Build WHERE for scorecards
        const where: Prisma.ScoreCardWhereInput = { poseId: id };
        if (!q.includeSkipped) where.skipped = false;

        // Filter by side if provided
        if (q.side && q.side !== 'ALL') {
            if (q.side === 'BOTH') {
                where.side = { in: ['LEFT', 'RIGHT'] };
            } else {
                where.side = q.side as any; // 'LEFT' | 'RIGHT' | 'NA'
            }
        }

        // Filter by session date window (preferred over createdAt for trending)
        if (from || to) {
            where.session = {
                ...(from ? { date: { gte: from } } : {}),
                ...(to ? { date: { lte: to } } : {}),
            };
        }

        // 5) Build SELECT dynamically for requested metrics
        const metricSelect = Object.fromEntries(metrics.map((m) => [m, true])) as Pick<
            Prisma.ScoreCardSelect,
            AllowedMetric
        >;

        const scoreCardSelect: Prisma.ScoreCardSelect = {
            id: true,
            createdAt: true,
            side: true,
            segment: true,
            orderInSession: true,
            skipped: true,
            session: { select: { date: true } },
            ...metricSelect,
        };

        // 6) Query scorecards (time-ordered)
        const cards = await prisma.scoreCard.findMany({
            where,
            select: scoreCardSelect,
            orderBy: [{ session: { date: 'asc' } }, { orderInSession: 'asc' }],
        });

        // 7) Map to response points
        const points: TrendPoint[] = cards.map((c) => ({
            scoreCardId: c.id,
            sessionDate: c.session!.date.toISOString(),
            createdAt: c.createdAt.toISOString(),
            side: c.side ?? null,
            segment: c.segment ?? null,
            orderInSession: c.orderInSession,
            skipped: c.skipped,
            values: Object.fromEntries(
                metrics.map((m) => [m, (c as any)[m] ?? null])
            ) as TrendPoint['values'],
        }));

        const resp: PoseTrendResponse = {
            pose,
            metrics,
            window: {
                from: from?.toISOString(),
                to: to?.toISOString(),
            },
            points,
        };

        res.json(resp);
    } catch (err: any) {
        res.status(400).json({ error: err?.message ?? 'Bad Request' });
    }
}