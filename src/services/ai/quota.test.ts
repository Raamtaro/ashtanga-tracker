import { jest } from "@jest/globals";

const prismaMock: any = {
    weeklyInsight: {
        count: jest.fn(),
    },
    poseInsight: {
        count: jest.fn(),
    },
};

jest.unstable_mockModule("../../lib/prisma.js", () => ({
    default: prismaMock,
}));

const { getAiQuotaResponse } = await import("./quota.js");

describe("ai quota service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("computes remaining quota from consumed counts", async () => {
        prismaMock.weeklyInsight.count.mockResolvedValue(0);
        prismaMock.poseInsight.count.mockResolvedValue(2);

        const response = await getAiQuotaResponse("user_1");

        expect(response.quota.weeklyInsights).toEqual(
            expect.objectContaining({
                limit: 1,
                consumed: 0,
                remaining: 1,
                isMet: false,
            }),
        );
        expect(response.quota.poseInsights).toEqual(
            expect.objectContaining({
                limit: 3,
                consumed: 2,
                remaining: 1,
                isMet: false,
            }),
        );
        expect(response.window.start).toMatch(/T00:00:00\.000Z$/);
        expect(response.window.endExclusive).toMatch(/T00:00:00\.000Z$/);
    });

    it("floors remaining quota at zero when consumed exceeds limits", async () => {
        prismaMock.weeklyInsight.count.mockResolvedValue(99);
        prismaMock.poseInsight.count.mockResolvedValue(99);

        const response = await getAiQuotaResponse("user_1");

        expect(response.quota.weeklyInsights.remaining).toBe(0);
        expect(response.quota.weeklyInsights.isMet).toBe(true);
        expect(response.quota.poseInsights.remaining).toBe(0);
        expect(response.quota.poseInsights.isMet).toBe(true);
    });
});

