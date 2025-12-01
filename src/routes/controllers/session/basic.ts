import prisma from "../../../lib/prisma";
import { Request, Response } from "express";


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

}