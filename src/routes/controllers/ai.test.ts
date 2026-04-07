import { jest } from "@jest/globals";
import type { Request, Response } from "express";

import { HttpError } from "../../services/ai/shared.js";

const getSessionAiInsightResponseMock: any = jest.fn();
const getWeeklyInsightsResponseMock: any = jest.fn();
const getPoseInsightsResponseMock: any = jest.fn();
const getAiQuotaResponseMock: any = jest.fn();

jest.unstable_mockModule("../../services/ai/sessionInsight.js", () => ({
    getSessionAiInsightResponse: getSessionAiInsightResponseMock,
}));

jest.unstable_mockModule("../../services/ai/weeklyInsight.js", () => ({
    getWeeklyInsightsResponse: getWeeklyInsightsResponseMock,
}));

jest.unstable_mockModule("../../services/ai/poseInsight.js", () => ({
    getPoseInsightsResponse: getPoseInsightsResponseMock,
}));

jest.unstable_mockModule("../../services/ai/quota.js", () => ({
    getAiQuotaResponse: getAiQuotaResponseMock,
}));

const {
    getAiQuota,
    getPoseInsights,
    getSessionAiInsight,
    getWeeklyInsights,
} = await import("./ai.js");

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

describe("ai controller", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("returns 401 for unauthenticated requests", async () => {
        const req = createReqMock({ params: { id: "session_1" } });
        const res = createResMock();

        await getSessionAiInsight(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    });

    it("returns 400 when session id param is missing", async () => {
        const req = createReqMock({ user: { id: "user_1" }, params: {} });
        const res = createResMock();

        await getSessionAiInsight(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "Missing session id" });
    });

    it("returns session ai insight response payload", async () => {
        getSessionAiInsightResponseMock.mockResolvedValue({
            session: { id: "session_1" },
            ai: { summary: "ok" },
        });

        const req = createReqMock({ user: { id: "user_1" }, params: { id: "session_1" } });
        const res = createResMock();

        await getSessionAiInsight(req, res);

        expect(getSessionAiInsightResponseMock).toHaveBeenCalledWith("user_1", "session_1");
        expect(res.json).toHaveBeenCalledWith({
            session: { id: "session_1" },
            ai: { summary: "ok" },
        });
    });

    it("maps HttpError to response status/body", async () => {
        getSessionAiInsightResponseMock.mockRejectedValue(
            new HttpError(404, "Session not found", { error: "Session not found" }),
        );

        const req = createReqMock({ user: { id: "user_1" }, params: { id: "missing" } });
        const res = createResMock();

        await getSessionAiInsight(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Session not found" });
    });

    it("parses weekly body and forwards parsed values", async () => {
        getWeeklyInsightsResponseMock.mockResolvedValue({ window: { currentWeek: { start: "x", endExclusive: "y" } } });

        const req = createReqMock({
            user: { id: "user_1" },
            body: { includeDrafts: "true", weekStartsOn: "SUNDAY" },
        });
        const res = createResMock();

        await getWeeklyInsights(req, res);

        expect(getWeeklyInsightsResponseMock).toHaveBeenCalledWith(
            "user_1",
            expect.objectContaining({
                includeDrafts: true,
                weekStartsOn: "SUNDAY",
                timeZone: "UTC",
            }),
        );
        expect(res.json).toHaveBeenCalledWith({
            window: { currentWeek: { start: "x", endExclusive: "y" } },
        });
    });

    it("forwards pose id/body to pose insights service", async () => {
        getPoseInsightsResponseMock.mockResolvedValue({ pose: { id: "pose_1" } });

        const req = createReqMock({
            user: { id: "user_1" },
            params: { id: "pose_1" },
            body: { days: "7" },
        });
        const res = createResMock();

        await getPoseInsights(req, res);

        expect(getPoseInsightsResponseMock).toHaveBeenCalledWith(
            "user_1",
            "pose_1",
            expect.objectContaining({ days: 7, timeZone: "UTC" }),
        );
        expect(res.json).toHaveBeenCalledWith({ pose: { id: "pose_1" } });
    });

    it("maps generic status-bearing errors from quota service", async () => {
        getAiQuotaResponseMock.mockRejectedValue(
            Object.assign(new Error("Quota reached"), { status: 429 }),
        );

        const req = createReqMock({ user: { id: "user_1" } });
        const res = createResMock();

        await getAiQuota(req, res);

        expect(res.status).toHaveBeenCalledWith(429);
        expect(res.json).toHaveBeenCalledWith({ error: "Quota reached" });
    });
});

