import { jest } from "@jest/globals";

const prismaMock: any = {
    weeklyInsight: {
        findFirst: jest.fn(),
        count: jest.fn(),
    },
    practiceSession: {
        findMany: jest.fn(),
    },
    scoreCard: {
        count: jest.fn(),
    },
};

jest.unstable_mockModule("../../lib/prisma.js", () => ({
    default: prismaMock,
}));

const { getWeeklyInsightsResponse } = await import("./weeklyInsight.js");

describe("ai weeklyInsight service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("returns cached weekly insight when exact configuration exists", async () => {
        prismaMock.weeklyInsight.findFirst.mockResolvedValue({
            id: "weekly_1",
            createdAt: new Date("2026-04-07T00:00:00.000Z"),
            computed: { kpi: 1 },
            llmInput: { context: { generatedAt: "2026-04-07T00:00:00.000Z" } },
            ai: { summary: "cached" },
        });

        const response = await getWeeklyInsightsResponse("user_1", {
            weekStartsOn: "MONDAY",
            timeZone: "UTC",
            includeDrafts: false,
        });

        expect(response.meta.source).toBe("cache");
        expect(response.meta.insightId).toBe("weekly_1");
        expect(response.ai).toEqual({ summary: "cached" });
        expect(prismaMock.weeklyInsight.count).not.toHaveBeenCalled();
    });

    it("throws 429 when weekly quota is exhausted and no fallback exists", async () => {
        prismaMock.weeklyInsight.findFirst
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null);
        prismaMock.weeklyInsight.count.mockResolvedValue(1); // limit is 1

        await expect(
            getWeeklyInsightsResponse("user_1", {
                weekStartsOn: "MONDAY",
                timeZone: "UTC",
                includeDrafts: false,
            }),
        ).rejects.toMatchObject({
            status: 429,
            message: "Weekly insight generation limit reached for this week.",
        });
    });
});

