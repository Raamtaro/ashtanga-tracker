import { Request, Response } from 'express'

export const healthAndGutCheck = (req: Request, res: Response) => {
    res.status(200).json(
        {
            ok: true,
            env: process.env.NODE_ENV ?? 'unknown',
            time: new Date().toISOString(),
            commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
            uptime: process.uptime()
        }
    )
};