import prisma from "../../../lib/prisma.js";
import { Prisma } from "@prisma/client";
import { Request, Response } from "express";
import type { UpdateSessionByIdResponse } from "../../../types/session.js";
import {
    sendInternalServerError,
    sendInvalidInput,
    sendSessionNotFoundOrNoPermission,
    sendSessionPublishedLocked,
} from "./basic.errors.js";
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
        return sendInvalidInput(res, parsed.error.issues);
    }
    const body = parsed.data;

    try {
        const session = await prisma.practiceSession.findFirst({
            where: { id: sessionId, userId },
            select: SESSION_ID_STATUS_SELECT,
        });

        if (!session) return sendSessionNotFoundOrNoPermission(res);
        if (session.status === "PUBLISHED") {
            return sendSessionPublishedLocked(res);
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
        return sendInternalServerError(res);
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
            return sendSessionNotFoundOrNoPermission(res);
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
        return sendInternalServerError(res);
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
            return sendSessionNotFoundOrNoPermission(res);
        }

        return res.json({ message: "Session deleted" });
    } catch (err) {
        console.error("deleteSession error", err);
        return sendInternalServerError(res);
    }
}
