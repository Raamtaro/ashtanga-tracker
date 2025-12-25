import prisma from "../../../lib/prisma";
import { Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { z } from "zod";
import { SequenceGroup } from "@prisma/client";

// // GET /sessions?page=1&limit=20&status=PUBLISHED&from=2025-11-01&to=2025-11-30
// const sessionsQuerySchema = z.object({
//     page: z.coerce.number().int().positive().optional().default(1),
//     limit: z.coerce.number().int().positive().max(100).optional().default(20),
//     status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
//     from: z.coerce.date().optional(),
//     to: z.coerce.date().optional(),
// });

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

    if (!client?.id) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const { id } = req.params;
    const session = await prisma.practiceSession.findUnique({
        where: {
            id: id,
            userId: client.id
        },
        // include: { 
        //     scoreCards: { 
        //         orderBy: { orderInSession: 'asc' },
        //         include: { pose: {
        //             select: {
        //                 slug: true
        //             }
        //         }}
        //     } 
        // },
        select: {
            // id: true,
            scoreCards: {
                orderBy: { orderInSession: 'asc' },
                select: {
                    id: true,
                    side: true,
                    overallScore: true,
                    pose: {
                        select: {
                            sanskritName: true,
                            sequenceGroup: true,
                        }
                    }
                }
            }
        }
    });
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ session });

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
    if (!client?.id) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Missing session id' });

    try {
        // Try to publish (DRAFT -> PUBLISHED)
        const published = await prisma.practiceSession.updateMany({
            where: { id: id, userId: client.id, status: 'DRAFT' },
            data: { status: 'PUBLISHED' },
        });

        if (published.count === 0) {
            // Try to unpublish (PUBLISHED -> DRAFT)
            const unpublished = await prisma.practiceSession.updateMany({
                where: { id: id, userId: client.id, status: 'PUBLISHED' },
                data: { status: 'DRAFT' },
            });

            if (unpublished.count === 0) {
                // Nothing changed -> session either doesn't exist or doesn't belong to user
                const exists = await prisma.practiceSession.findFirst({
                    where: { id: id, userId: client.id },
                    select: { id: true },
                });
                if (!exists) return res.status(404).json({ error: 'Session not found or no permission' });
            }
        }

        const updated = await prisma.practiceSession.findFirst({
            where: { id: id, userId: client.id },
            select: { id: true, status: true, date: true },
        });

        if (!updated) return res.status(404).json({ error: 'Session not found' });

        return res.json({ session: updated });
    } catch (err) {
        console.error('publishSession error', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
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