import prisma from "../../../lib/prisma";
import { Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { z } from "zod";
import { SequenceGroup } from "@prisma/client";

// GET /sessions?page=1&limit=20&status=PUBLISHED&from=2025-11-01&to=2025-11-30
const sessionsQuerySchema = z.object({
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(20),
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
});

// GET /poses?segment=PRIMARY (optional)
const posesQuerySchema = z.object({
  segment: z.enum(SequenceGroup).optional(),
});


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
        include: { scoreCards: { orderBy: { orderInSession: 'asc' } } },
    });
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ session });

}

export const getAllSessions = async (req: Request, res: Response) => {
    const client = req.user as { id: string } | undefined;

    if (!client?.id) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const sessions = await prisma.practiceSession.findMany({
        where: {
            userId: client.id,
        },
        select: {
            id: true,
            userId: true,
            date: true,
        },
        orderBy: { date: 'desc' },
    });
    console.log(sessions.length)
    if (!sessions.length) return res.status(404).json({ message: "No sessions found." });
    res.json({ sessions });
}

export const publishSession = async (req: Request, res: Response) => {
    const client = req.user as { id: string } | undefined;
    if (!client?.id) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const { id } = req.params;
    const session = await prisma.practiceSession.findUnique(
        {
            where: {
                id: id,
                userId: client.id
            },
            select: {
                status: true
            }
        }
    )

    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }

    const changeStatusFlag = session.status === 'DRAFT' ? 'PUBLISHED' : 'DRAFT';

    const updatedSession = await prisma.practiceSession.update(
        {
            where: {
                id: id,
            },
            data: {
                status: changeStatusFlag
            }

        }
    )

    res.json({ session: updatedSession });
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



export async function listSessions(req: Request, res: Response) {
  try {
    const client = req.user as { id: string } | undefined;
    if (!client?.id) return res.status(401).json({ message: 'Unauthorized' });

    const q = sessionsQuerySchema.parse(req.query);
    const skip = (q.page - 1) * q.limit;

    const where: Prisma.PracticeSessionWhereInput = {
      userId: client.id,
      ...(q.status ? { status: q.status } : {}),
      ...(q.from || q.to
        ? { date: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } }
        : {}),
    };

    const [total, sessions] = await Promise.all([
      prisma.practiceSession.count({ where }),
      prisma.practiceSession.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: q.limit,
        select: {
          id: true, date: true, label: true, practiceType: true, status: true, overallScore: true,
          scoreCards: { select: { id: true }, take: 1 }, // light check for presence
        },
      }),
    ]);

    res.json({
      meta: {
        total,
        page: q.page,
        limit: q.limit,
        pages: Math.ceil(total / q.limit),
      },
      sessions,
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? 'Bad Request' });
  }
}