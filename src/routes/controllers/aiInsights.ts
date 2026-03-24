import { Request, Response } from "express";

import { HttpError } from "../../services/ai/shared.js";
import {
    getInsightDetailResponse,
    getInsightsHistoryResponse,
    insightDetailParamsSchema,
    insightDetailQuerySchema,
    insightsHistoryQuerySchema,
} from "../../services/ai/insightsHistory.js";

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

export const getInsightsHistory = async (req: Request, res: Response) => {
    const client = req.user as { id: string } | undefined;
    if (!client?.id) return res.status(401).json({ error: "Unauthorized" });

    const query = insightsHistoryQuerySchema.parse(req.query ?? {});

    try {
        const response = await getInsightsHistoryResponse(client.id, query);
        return res.json(response);
    } catch (err) {
        console.error("getInsightsHistory error", err);
        const resolved = resolveError(err);
        return res.status(resolved.status).json(resolved.body);
    }
};

export const getInsightDetail = async (req: Request, res: Response) => {
    const client = req.user as { id: string } | undefined;
    if (!client?.id) return res.status(401).json({ error: "Unauthorized" });

    const params = insightDetailParamsSchema.parse(req.params ?? {});
    const query = insightDetailQuerySchema.parse(req.query ?? {});

    try {
        const response = await getInsightDetailResponse(client.id, params, query);
        return res.json(response);
    } catch (err) {
        console.error("getInsightDetail error", err);
        const resolved = resolveError(err);
        return res.status(resolved.status).json(resolved.body);
    }
};
