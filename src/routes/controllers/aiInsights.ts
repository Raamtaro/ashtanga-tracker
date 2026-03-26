import { Request, Response } from "express";

import { HttpError } from "../../services/ai/shared.js";
import {
    getInsightDetailResponse,
    getInsightsHistoryResponse,
    insightDetailParamsSchema,
    insightDetailQuerySchema,
    insightsHistoryQuerySchema,
} from "../../services/ai/insightsHistory.js";

function validationFailedBody(issues: Array<{ path: PropertyKey[]; message: string }>) {
    return {
        error: "Validation failed",
        issues: issues.map((issue) => ({
            path: issue.path
                .map((part) => typeof part === "symbol" ? String(part) : String(part))
                .join("."),
            message: issue.message,
        })),
    };
}

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

    const queryResult = insightsHistoryQuerySchema.safeParse(req.query ?? {});
    if (!queryResult.success) {
        return res.status(400).json(validationFailedBody(queryResult.error.issues));
    }

    try {
        const response = await getInsightsHistoryResponse(client.id, queryResult.data);
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

    const paramsResult = insightDetailParamsSchema.safeParse(req.params ?? {});
    if (!paramsResult.success) {
        return res.status(400).json(validationFailedBody(paramsResult.error.issues));
    }

    const queryResult = insightDetailQuerySchema.safeParse(req.query ?? {});
    if (!queryResult.success) {
        return res.status(400).json(validationFailedBody(queryResult.error.issues));
    }

    try {
        const response = await getInsightDetailResponse(client.id, paramsResult.data, queryResult.data);
        return res.json(response);
    } catch (err) {
        console.error("getInsightDetail error", err);
        const resolved = resolveError(err);
        return res.status(resolved.status).json(resolved.body);
    }
};
