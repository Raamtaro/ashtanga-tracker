import { jest } from "@jest/globals";
import type { Request, Response } from "express";

const prismaMock: any = {
    pose: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
    },
    scoreCard: {
        findMany: jest.fn(),
    },
};

jest.unstable_mockModule("../../lib/prisma.js", () => ({
    default: prismaMock,
}));

const {
    getAllPoses,
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
            query: { fields: "ease,pain", days: "30" },
        });
        const res = createResMock();

        await trendPoseMetrics(req, res);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                pose: expect.objectContaining({
                    id: "pose_1",
                }),
                metrics: ["ease", "pain"],
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

