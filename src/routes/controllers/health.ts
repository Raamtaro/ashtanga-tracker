import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";

export const healthAndGutCheck = (req: Request, res: Response) => {
    res.status(200).json({
        ok: true,
        env: process.env.NODE_ENV ?? "unknown",
        time: new Date().toISOString(),
        commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
        uptime: process.uptime(),
    });
};

export const readinessCheck = async (_req: Request, res: Response) => {
    try {
        await prisma.$queryRaw`SELECT 1`;

        return res.status(200).json({
            ok: true,
            db: "up",
            time: new Date().toISOString(),
        });
    } catch {
        return res.status(503).json({
            ok: false,
            db: "down",
            time: new Date().toISOString(),
        });
    }
};
