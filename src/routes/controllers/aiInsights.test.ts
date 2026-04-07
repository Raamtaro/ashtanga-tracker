import { jest } from "@jest/globals";
import type { Request, Response } from "express";
import { z } from "zod";

import { HttpError } from "../../services/ai/shared.js";

const getInsightsHistoryResponseMock: any = jest.fn();
const getInsightDetailResponseMock: any = jest.fn();

jest.unstable_mockModule("../../services/ai/insightsHistory.js", () => ({
    getInsightsHistoryResponse: getInsightsHistoryResponseMock,
    getInsightDetailResponse: getInsightDetailResponseMock,
    insightsHistoryQuerySchema: z.object({
        limit: z.coerce.number().int().positive().default(20),
        includeDebug: z.coerce.boolean().default(false),
    }),
    insightDetailParamsSchema: z.object({
        type: z.enum(["weekly", "pose"]),
        id: z.string().min(1),
    }),
    insightDetailQuerySchema: z.object({
        includeDebug: z.coerce.boolean().default(false),
    }),
}));

const { getInsightDetail, getInsightsHistory } = await import("./aiInsights.js");

function createResMock(): Response {
    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
    };
    return res as unknown as Response;
}

function createReqMock(
    input: Partial<Pick<Request, "body" | "params" | "query" | "user">>,
): Request {
    return input as Request;
}

describe("aiInsights controller", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("returns 401 for unauthenticated history requests", async () => {
        const req = createReqMock({ query: {} });
        const res = createResMock();

        await getInsightsHistory(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    });

    it("returns 400 for invalid history query", async () => {
        const req = createReqMock({
            user: { id: "user_1" },
            query: { limit: "-1" },
        });
        const res = createResMock();

        await getInsightsHistory(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                error: "Validation failed",
                issues: expect.arrayContaining([
                    expect.objectContaining({ path: "limit" }),
                ]),
            }),
        );
    });

    it("calls history service with parsed query", async () => {
        getInsightsHistoryResponseMock.mockResolvedValue({ data: [], page: { limit: 20 } });

        const req = createReqMock({
            user: { id: "user_1" },
            query: {},
        });
        const res = createResMock();

        await getInsightsHistory(req, res);

        expect(getInsightsHistoryResponseMock).toHaveBeenCalledWith(
            "user_1",
            { limit: 20, includeDebug: false },
        );
        expect(res.json).toHaveBeenCalledWith({ data: [], page: { limit: 20 } });
    });

    it("maps HttpError payload from history service", async () => {
        getInsightsHistoryResponseMock.mockRejectedValue(
            new HttpError(429, "Rate limited", { error: "Rate limited" }),
        );

        const req = createReqMock({
            user: { id: "user_1" },
            query: {},
        });
        const res = createResMock();

        await getInsightsHistory(req, res);

        expect(res.status).toHaveBeenCalledWith(429);
        expect(res.json).toHaveBeenCalledWith({ error: "Rate limited" });
    });

    it("returns 400 for invalid detail params", async () => {
        const req = createReqMock({
            user: { id: "user_1" },
            params: { type: "bad", id: "" },
            query: {},
        });
        const res = createResMock();

        await getInsightDetail(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                error: "Validation failed",
            }),
        );
    });

    it("calls detail service with parsed params/query", async () => {
        getInsightDetailResponseMock.mockResolvedValue({ meta: { insightId: "pose_1" } });

        const req = createReqMock({
            user: { id: "user_1" },
            params: { type: "pose", id: "pose_1" },
            query: { includeDebug: "true" },
        });
        const res = createResMock();

        await getInsightDetail(req, res);

        expect(getInsightDetailResponseMock).toHaveBeenCalledWith(
            "user_1",
            { type: "pose", id: "pose_1" },
            { includeDebug: true },
        );
        expect(res.json).toHaveBeenCalledWith({ meta: { insightId: "pose_1" } });
    });
});

