import prisma from "../../lib/prisma";
import { Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client"
import { METRIC_KEYS, type MetricKey } from "../../lib/constants";


const metricValue = z.coerce.number().int().min(1).max(10).nullable();

const updateBodySchema = z.object(
    {
        ease: metricValue.optional(),
        comfort: metricValue.optional(),
        stability: metricValue.optional(),
        pain: metricValue.optional(),
        breath: metricValue.optional(),
        focus: metricValue.optional(),

        //Other Optional Fields
        notes: z.string().max(2000).optional(),
        skipped: z.coerce.boolean().optional(),
        side: z.enum(['LEFT', 'RIGHT', 'BOTH', 'NA']).nullable().optional(),
    }
).refine(obj => Object.keys(obj).length > 0, { message: 'No fields to update' });

function computeOverall(from: Partial<Record<MetricKey, number | null>>): number | null {
    const nums = METRIC_KEYS
        .map(k => from[k] ?? null)
        .filter((v): v is number => typeof v === 'number');
    if (!nums.length) return null;
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    return Math.round(avg * 100) / 100; // 2 decimals
}


export const updateScoreCard = async (req: Request, res: Response) => {
    const client = req.user as { id: string } | undefined;
    const { id } = req.params;
    const payload = updateBodySchema.parse(req.body);

    if (!client?.id) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.scoreCard.findFirst(
            {
                where: {
                    id,
                    session: {
                        userId: client.id
                    }
                },
                select: {
                    id: true,
                    sessionId: true,
                    skipped: true,
                    side: true,
                    notes: true,
                    ease: true,
                    comfort: true,
                    stability: true,
                    pain: true,
                    breath: true,
                    focus: true,
                }
            }
        )

        if (!existing) {
            // ensure rollback inside tx by throwing
            throw Object.assign(new Error('ScoreCard not found'), { status: 404 });
        }

        const willSkip = payload.skipped ?? existing.skipped;

        const mergedMetrics: Partial<Record<MetricKey, number | null>> = {};
        for (const k of METRIC_KEYS) {
            const incoming = payload[k];
            const current = existing[k];
            mergedMetrics[k] = willSkip ? null : (incoming !== undefined ? incoming : current);
        }

        const overallScore = willSkip ? null : computeOverall(mergedMetrics);

        const data: Prisma.ScoreCardUpdateInput = {
            ...('notes' in payload ? { notes: payload.notes ?? null } : {}),
            ...('side' in payload ? { side: payload.side ?? null } : {}),
            ...('skipped' in payload ? { skipped: willSkip } : {}),
            ...mergedMetrics,
            overallScore,
        };

        const updated = await tx.scoreCard.update({
            where: { id: existing.id },
            data,
            select: {
                id: true, sessionId: true, segment: true, side: true, skipped: true, notes: true,
                ease: true, comfort: true, stability: true, pain: true, breath: true, focus: true,
                overallScore: true,
            },
        });

        const agg = await tx.scoreCard.aggregate({
            where: { sessionId: existing.sessionId, skipped: false, overallScore: { not: null } },
            _avg: { overallScore: true },
        });

        await tx.practiceSession.update({
            where: { id: existing.sessionId },
            data: { overallScore: agg._avg.overallScore ?? null },
            select: { id: true }, // small payload
        });

        return updated;
    })

    res.json({scoreCard: result});

}


//GetbyId helper

export const getScoreCardById = async (req: Request, res: Response) => {
    const client = req.user as { id: string } | undefined;
    const { id } = req.params;

    if (!client?.id) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const scoreCard = await prisma.scoreCard.findFirst(
        {
            where: {
                id,
                session: {
                    userId: client.id
                }
            },
            select: {
                id: true, sessionId: true, segment: true, side: true, skipped: true, notes: true,
                ease: true, comfort: true, stability: true, pain: true, breath: true, focus: true,
                overallScore: true,
            }
        }
    )

    if (!scoreCard) {
        return res.status(404).json({ message: "ScoreCard not found." });
    }

    res.json({ scoreCard });
}