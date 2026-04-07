import { jest } from "@jest/globals";
import type { Request, Response } from "express";

const prismaMock: any = {
    scoreCard: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
};

jest.unstable_mockModule("../../lib/prisma.js", () => ({
    default: prismaMock,
}));

const { getScoreCardById, updateScoreCard } = await import("./scoreCard.js");

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

describe("scoreCard controller", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("getScoreCardById returns 401 for unauthenticated request", async () => {
        const req = createReqMock({ params: { id: "card_1" } });
        const res = createResMock();

        await getScoreCardById(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
    });

    it("getScoreCardById returns 404 when card does not exist", async () => {
        prismaMock.scoreCard.findFirst.mockResolvedValue(null);

        const req = createReqMock({
            user: { id: "user_1" },
            params: { id: "card_1" },
        });
        const res = createResMock();

        await getScoreCardById(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ message: "ScoreCard not found." });
    });

    it("updateScoreCard returns 409 when session is published", async () => {
        prismaMock.scoreCard.findUnique.mockResolvedValue({
            sessionId: "session_1",
            session: { status: "PUBLISHED", userId: "user_1" },
        });

        const req = createReqMock({
            user: { id: "user_1" },
            params: { id: "card_1" },
            body: { ease: 8 },
        });
        const res = createResMock();

        await updateScoreCard(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            error: "Session is published. Unpublish to edit.",
        });
    });

    it("updateScoreCard rejects skipped=true when existing card is scored", async () => {
        prismaMock.scoreCard.findUnique.mockResolvedValue({
            sessionId: "session_1",
            session: { status: "DRAFT", userId: "user_1" },
        });

        prismaMock.$transaction.mockImplementation(
            async (cb: (tx: any) => Promise<unknown>) =>
                cb({
                    scoreCard: {
                        findFirst: async () => ({
                            id: "card_1",
                            sessionId: "session_1",
                            scored: true,
                            skipped: false,
                            side: "NA",
                            notes: null,
                            ease: 8,
                            comfort: 8,
                            stability: 8,
                            pain: 8,
                            breath: 8,
                            focus: 8,
                        }),
                        update: async () => {
                            throw new Error("should not be called");
                        },
                    },
                }),
        );

        const req = createReqMock({
            user: { id: "user_1" },
            params: { id: "card_1" },
            body: { skipped: true },
        });
        const res = createResMock();

        await updateScoreCard(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            error: "Cannot set skipped=true for a scored scoreCard.",
        });
    });

    it("updateScoreCard computes merged metrics and overallScore", async () => {
        prismaMock.scoreCard.findUnique.mockResolvedValue({
            sessionId: "session_1",
            session: { status: "DRAFT", userId: "user_1" },
        });

        const updateMock = jest.fn(async () => ({
            id: "card_1",
            sessionId: "session_1",
            segment: "STANDING",
            side: "NA",
            scored: false,
            skipped: false,
            notes: null,
            ease: 9,
            comfort: 8,
            stability: 8,
            pain: 7,
            breath: 8,
            focus: 8,
            overallScore: 8,
        }));

        prismaMock.$transaction.mockImplementation(
            async (cb: (tx: any) => Promise<unknown>) =>
                cb({
                    scoreCard: {
                        findFirst: async () => ({
                            id: "card_1",
                            sessionId: "session_1",
                            scored: false,
                            skipped: false,
                            side: "NA",
                            notes: null,
                            ease: 8,
                            comfort: 8,
                            stability: 8,
                            pain: 7,
                            breath: 8,
                            focus: 8,
                        }),
                        update: updateMock,
                    },
                }),
        );

        const req = createReqMock({
            user: { id: "user_1" },
            params: { id: "card_1" },
            body: { ease: 9 },
        });
        const res = createResMock();

        await updateScoreCard(req, res);

        expect(updateMock).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "card_1" },
                data: expect.objectContaining({
                    ease: 9,
                    comfort: 8,
                    stability: 8,
                    pain: 7,
                    breath: 8,
                    focus: 8,
                    overallScore: 8,
                }),
            }),
        );

        expect(res.json).toHaveBeenCalledWith({
            scoreCard: expect.objectContaining({
                id: "card_1",
                overallScore: 8,
            }),
        });
    });
});

