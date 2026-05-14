import { jest } from "@jest/globals";
import type { Request, Response } from "express";

const prismaMock: any = {
    pose: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
    },
    scoreCard: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
    },
};

jest.unstable_mockModule("../../lib/prisma.js", () => ({
    default: prismaMock,
}));

const {
    getAllPoses,
    getPoseById,
    getScoredPoses,
    listPosesBySegment,
    trendPoseMetrics,
} = await import("./poses.js");

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

describe("poses controller", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("getAllPoses returns 404 when no poses are found", async () => {
        prismaMock.pose.findMany.mockResolvedValue([]);

        const req = createReqMock({});
        const res = createResMock();

        await getAllPoses(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ message: "No poses found." });
    });

    it("listPosesBySegment returns 400 for invalid segment query", async () => {
        const req = createReqMock({
            user: { id: "user_1" },
            query: { segment: "NOT_A_GROUP" },
        });
        const res = createResMock();

        await listPosesBySegment(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: expect.any(String) }),
        );
    });

    it("getScoredPoses returns 401 for unauthenticated request", async () => {
        const req = createReqMock({});
        const res = createResMock();

        await getScoredPoses(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
    });

    it("getScoredPoses returns 404 when user has no scored poses", async () => {
        prismaMock.pose.findMany.mockResolvedValue([]);

        const req = createReqMock({
            user: { id: "user_1" },
        });
        const res = createResMock();

        await getScoredPoses(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ message: "No scored poses found." });
    });

    it("getPoseById returns 401 for unauthenticated request", async () => {
        const req = createReqMock({ params: { id: "pose_1" }, query: {} });
        const res = createResMock();

        await getPoseById(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
    });

    it("getPoseById returns scoped pose usage summary", async () => {
        prismaMock.pose.findUnique.mockResolvedValue({
            id: "pose_1",
            slug: "pose-a",
            sanskritName: "Pose A",
            englishName: null,
            isTwoSided: false,
            sequenceGroup: "STANDING",
            orderInGroup: 1,
        });

        prismaMock.scoreCard.count
            .mockResolvedValueOnce(12)
            .mockResolvedValueOnce(9)
            .mockResolvedValueOnce(8);

        prismaMock.scoreCard.findFirst.mockResolvedValue({
            session: { date: new Date("2026-04-07T06:00:00.000Z") },
        });

        const req = createReqMock({
            user: { id: "user_1" },
            params: { id: "pose_1" },
            query: {},
        });
        const res = createResMock();

        await getPoseById(req, res);

        expect(res.json).toHaveBeenCalledWith({
            pose: expect.objectContaining({ id: "pose_1", slug: "pose-a" }),
            usage: {
                practicedCardCount: 12,
                scoredCardCount: 9,
                analyzedScoredCardCount: 8,
                latestAnalyzedSessionDate: "2026-04-07T06:00:00.000Z",
            },
        });
        expect(prismaMock.scoreCard.findMany).not.toHaveBeenCalled();
    });

    it("getPoseById returns bounded card list when includeCards=true", async () => {
        prismaMock.pose.findUnique.mockResolvedValue({
            id: "pose_1",
            slug: "pose-a",
            sanskritName: "Pose A",
            englishName: null,
            isTwoSided: false,
            sequenceGroup: "STANDING",
            orderInGroup: 1,
        });

        prismaMock.scoreCard.count
            .mockResolvedValueOnce(2)
            .mockResolvedValueOnce(2)
            .mockResolvedValueOnce(2);

        prismaMock.scoreCard.findFirst.mockResolvedValue({
            session: { date: new Date("2026-04-07T06:00:00.000Z") },
        });

        prismaMock.scoreCard.findMany.mockResolvedValue([
            {
                id: "card_1",
                orderInSession: 1,
                side: "NA",
                segment: "STANDING",
                scored: true,
                skipped: false,
                overallScore: 8,
                session: {
                    id: "session_1",
                    date: new Date("2026-04-07T06:00:00.000Z"),
                    status: "PUBLISHED",
                },
            },
        ]);

        const req = createReqMock({
            user: { id: "user_1" },
            params: { id: "pose_1" },
            query: { includeCards: "true", cardsLimit: "10" },
        });
        const res = createResMock();

        await getPoseById(req, res);

        expect(prismaMock.scoreCard.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ take: 10 }),
        );
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                cards: [expect.objectContaining({ id: "card_1" })],
                page: {
                    includeCards: true,
                    cardsLimit: 10,
                    returnedCards: 1,
                },
            }),
        );
    });

    it("trendPoseMetrics returns 401 for unauthenticated request", async () => {
        const req = createReqMock({
            params: { id: "pose_1" },
            query: {},
        });
        const res = createResMock();

        await trendPoseMetrics(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
    });

    it("trendPoseMetrics rejects invalid days values", async () => {
        const req = createReqMock({
            user: { id: "user_1" },
            params: { id: "pose_1" },
            query: { days: "all" },
        });
        const res = createResMock();

        await trendPoseMetrics(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: expect.any(String) }),
        );
    });

    it("trendPoseMetrics returns 404 when pose is missing", async () => {
        prismaMock.pose.findUnique.mockResolvedValue(null);

        const req = createReqMock({
            user: { id: "user_1" },
            params: { id: "pose_404" },
            query: {},
        });
        const res = createResMock();

        await trendPoseMetrics(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ message: "Pose not found." });
    });

    it("trendPoseMetrics returns trend payload for valid request", async () => {
        prismaMock.pose.findUnique.mockResolvedValue({
            id: "pose_1",
            slug: "pose-a",
            sanskritName: "Pose A",
            englishName: null,
            isTwoSided: false,
        });

        prismaMock.scoreCard.findMany.mockResolvedValue([
            {
                id: "card_1",
                createdAt: new Date("2026-04-07T06:00:00.000Z"),
                side: "NA",
                segment: "STANDING",
                orderInSession: 1,
                skipped: false,
                session: { date: new Date("2026-04-07T06:00:00.000Z") },
                ease: 8,
                pain: 7,
            },
        ]);

        const req = createReqMock({
            user: { id: "user_1" },
            params: { id: "pose_1" },
            query: { fields: "ease,pain", days: "30", maxPoints: "100" },
        });
        const res = createResMock();

        await trendPoseMetrics(req, res);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                pose: expect.objectContaining({
                    id: "pose_1",
                }),
                metrics: ["ease", "pain"],
                page: expect.objectContaining({
                    maxPoints: 100,
                    returnedPoints: 1,
                    truncated: false,
                }),
                points: [
                    expect.objectContaining({
                        scoreCardId: "card_1",
                        values: { ease: 8, pain: 7 },
                    }),
                ],
            }),
        );
    });
});
