import prisma from "../../../lib/prisma.js";
import { Prisma } from "@prisma/client";
import { Request, Response } from "express";
import type { UpdateSessionByIdResponse } from "../../../types/session.js";
import {
    requireSessionIdParam,
    requireUserId,
    updateSessionBodySchema,
} from "./basic.helpers.js";
import {
    SESSION_ID_STATUS_SELECT,
    SESSION_UPDATE_SELECT,
} from "./basic.selects.js";
import { runPublishWorkflow } from "./publishSession.service.js";

export const updateSessionById = async (req: Request, res: Response) => {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const sessionId = requireSessionIdParam(req, res);
    if (!sessionId) return;

    const parsed = updateSessionBodySchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(422).json({
            message: "Invalid input",
            issues: parsed.error.issues.map((issue) => ({
                path: issue.path.join("."),
                message: issue.message,
            })),
        });
    }
    const body = parsed.data;

    try {
        const session = await prisma.practiceSession.findFirst({
            where: { id: sessionId, userId },
            select: SESSION_ID_STATUS_SELECT,
        });

        if (!session) return res.status(404).json({ error: "Session not found or no permission" });
        if (session.status === "PUBLISHED") {
            return res.status(409).json({ error: "Session is published. Unpublish to edit." });
        }

        const data: Prisma.PracticeSessionUpdateInput = {
            ...("label" in body ? { label: body.label } : {}),
            ...("durationMinutes" in body ? { durationMinutes: body.durationMinutes } : {}),
            ...("overallScore" in body ? { overallScore: body.overallScore } : {}),
            ...("energyLevel" in body ? { energyLevel: body.energyLevel } : {}),
            ...("mood" in body ? { mood: body.mood } : {}),
            ...("notes" in body ? { notes: body.notes } : {}),
        };

        const updated = await prisma.practiceSession.update({
            where: { id: session.id },
            data,
            select: SESSION_UPDATE_SELECT,
        });

        const responseShape: UpdateSessionByIdResponse = {
            session: {
                ...updated,
                date: updated.date.toISOString(),
            },
        };

        return res.json(responseShape);
    } catch (err) {
        console.error("updateSessionById error", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

export const publishSession = async (req: Request, res: Response) => {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const sessionId = requireSessionIdParam(req, res);
    if (!sessionId) return;

    try {
        const result = await prisma.$transaction((tx) => runPublishWorkflow(tx, { sessionId, userId }));

        if (result.kind === "not_found") {
            return res.status(404).json({ error: "Session not found or no permission" });
        }
        if (result.kind === "incomplete") {
            return res.status(409).json(result.error);
        }

        return res.json({
            session: {
                ...result.session,
                date: result.session.date.toISOString(),
            },
        });
    } catch (err) {
        console.error("publishSession error", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

export async function deleteSession(req: Request, res: Response) {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const sessionId = requireSessionIdParam(req, res);
    if (!sessionId) return;

    try {
        const deleted = await prisma.practiceSession.deleteMany({
            where: { id: sessionId, userId },
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
