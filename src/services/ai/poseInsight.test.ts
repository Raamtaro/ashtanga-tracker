import { jest } from "@jest/globals";

const prismaMock: any = {
    pose: {
        findFirst: jest.fn(),
    },
    poseInsight: {
        findFirst: jest.fn(),
        count: jest.fn(),
    },
    scoreCard: {
        findMany: jest.fn(),
        count: jest.fn(),
    },
};

jest.unstable_mockModule("../../lib/prisma.js", () => ({
    default: prismaMock,
}));

const { getPoseInsightsResponse } = await import("./poseInsight.js");

describe("ai poseInsight service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        prismaMock.pose.findFirst.mockResolvedValue({
            id: "pose_1",
            slug: "pose-a",
            sanskritName: "Pose A",
            englishName: null,
        });
    });

    it("returns exact cached pose insight for requested timeframe", async () => {
        prismaMock.poseInsight.findFirst.mockResolvedValueOnce({
            id: "pose_insight_1",
            createdAt: new Date("2026-04-07T00:00:00.000Z"),
            timeframeStart: new Date("2026-03-01T00:00:00.000Z"),
            timeframeEndExclusive: new Date("2026-03-31T00:00:00.000Z"),
            totalDays: 30,
            computed: { kpi: 1 },
            llmInput: { context: { generatedAt: "2026-04-07T00:00:00.000Z" } },
            ai: { summary: "cached pose insight" },
        });

        const response = await getPoseInsightsResponse("user_1", "pose_1", {
            timeZone: "UTC",
        });

        expect(response.meta.source).toBe("cache");
        expect(response.meta.insightId).toBe("pose_insight_1");
        expect(response.ai).toEqual({ summary: "cached pose insight" });
        expect(prismaMock.poseInsight.count).not.toHaveBeenCalled();
    });

    it("returns recent pose cache when generated in last 7 days", async () => {
        prismaMock.poseInsight.findFirst
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({
                id: "pose_recent_1",
                createdAt: new Date("2026-04-06T00:00:00.000Z"),
                timeframeStart: new Date("2026-03-01T00:00:00.000Z"),
                timeframeEndExclusive: new Date("2026-03-31T00:00:00.000Z"),
                totalDays: 30,
                computed: { kpi: 2 },
                llmInput: { context: { generatedAt: "2026-04-06T00:00:00.000Z" } },
                ai: { summary: "recent pose insight" },
            });

        const response = await getPoseInsightsResponse("user_1", "pose_1", {
            timeZone: "UTC",
        });

        expect(response.meta.source).toBe("pose_recent_cache");
        expect(response.meta.insightId).toBe("pose_recent_1");
        expect(response.ai).toEqual({ summary: "recent pose insight" });
    });

    it("throws 429 when pose quota is exhausted and no cache is available", async () => {
        prismaMock.poseInsight.findFirst
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null);
        prismaMock.poseInsight.count.mockResolvedValue(3); // limit is 3

        await expect(
            getPoseInsightsResponse("user_1", "pose_1", {
                timeZone: "UTC",
            }),
        ).rejects.toMatchObject({
            status: 429,
            message: "Pose insight generation limit reached for this week.",
        });
    });
});

