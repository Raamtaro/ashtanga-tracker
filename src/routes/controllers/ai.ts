import { Request, Response } from "express";

import {
    HttpError,
    poseInsightsBodySchema,
    weeklyInsightsBodySchema,
} from "../../services/ai/shared.js";
import { getSessionAiInsightResponse } from "../../services/ai/sessionInsight.js";
import { getWeeklyInsightsResponse } from "../../services/ai/weeklyInsight.js";
import { getPoseInsightsResponse } from "../../services/ai/poseInsight.js";

function resolveError(err: unknown) {
    if (err instanceof HttpError) {
        return {
            status: err.status,
            body: err.payload ?? { error: err.message },
        };
    }

    if (typeof err === "object" && err && "status" in err) {
        const status = Number((err as { status: number }).status);
        const message = err instanceof Error ? err.message : "Internal server error";
        return {
            status,
            body: { error: message },
        };
    }

    const message = err instanceof Error ? err.message : "Internal server error";
    return {
        status: 500,
        body: { error: message },
    };
}

export const getSessionAiInsight = async (req: Request, res: Response) => {
    const client = req.user as { id: string } | undefined;
    if (!client?.id) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing session id" });

    try {
        const response = await getSessionAiInsightResponse(client.id, id);
        return res.json(response);
    } catch (err) {
        console.error("getSessionAiInsight error", err);
        const resolved = resolveError(err);
        return res.status(resolved.status).json(resolved.body);
    }
};

export const getWeeklyInsights = async (req: Request, res: Response) => {
    const client = req.user as { id: string } | undefined;
    if (!client?.id) return res.status(401).json({ error: "Unauthorized" });

    const body = weeklyInsightsBodySchema.parse(req.body ?? {});

    try {
        const response = await getWeeklyInsightsResponse(client.id, body);
        return res.json(response);
    } catch (err) {
        console.error("getWeeklyInsights error", err);
        const resolved = resolveError(err);
        return res.status(resolved.status).json(resolved.body);
    }
};

export const getPoseInsights = async (req: Request, res: Response) => {
    const client = req.user as { id: string } | undefined;
    if (!client?.id) return res.status(401).json({ error: "Unauthorized" });

    const poseId = req.params.id;
    const body = poseInsightsBodySchema.parse(req.body ?? {});

    try {
        const response = await getPoseInsightsResponse(client.id, poseId, body);
        return res.json(response);
    } catch (err) {
        console.error("getPoseInsights error", err);
        const resolved = resolveError(err);
        return res.status(resolved.status).json(resolved.body);
    }
};
