import { jest } from "@jest/globals";

import { HttpError } from "./shared.js";

const prismaMock: any = {
    poseInsight: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
    },
    weeklyInsight: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
    },
};

jest.unstable_mockModule("../../lib/prisma.js", () => ({
    default: prismaMock,
}));

const {
    getInsightDetailResponse,
    getInsightsHistoryResponse,
    insightsHistoryQuerySchema,
} = await import("./insightsHistory.js");

function makeHistoryQuery(overrides?: Record<string, unknown>) {
    return insightsHistoryQuerySchema.parse({
        limit: 20,
        timeZone: "UTC",
        includeDebug: false,
        ...overrides,
    });
}

describe("ai insightsHistory service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("throws HttpError(400) for an invalid cursor payload", async () => {
        await expect(
            getInsightsHistoryResponse(
                "user_1",
                makeHistoryQuery({ cursor: "not-base64-json" }),
            ),
        ).rejects.toMatchObject({
            status: 400,
            message: "Invalid cursor",
        });
    });

    it("merges weekly + pose insight rows with deterministic ordering", async () => {
        const createdAt = new Date("2026-04-07T00:00:00.000Z");

        prismaMock.poseInsight.findMany.mockResolvedValue([
            {
                id: "pose_1",
                createdAt,
                timeframeStart: new Date("2026-03-01T00:00:00.000Z"),
                timeframeEndExclusive: new Date("2026-03-31T00:00:00.000Z"),
                totalDays: 30,
                timeZone: "UTC",
                model: "gpt-4.1-mini",
                computed: { a: 1 },
                llmInput: { context: { generatedAt: "2026-04-07T00:00:00.000Z" } },
                ai: { summary: "Pose summary" },
                pose: {
                    id: "pose_ref_1",
                    slug: "pose-a",
                    sanskritName: "Pose A",
                    englishName: null,
                },
            },
        ]);

        prismaMock.weeklyInsight.findMany.mockResolvedValue([
            {
                id: "weekly_1",
                createdAt,
                weekStart: new Date("2026-03-30T00:00:00.000Z"),
                weekEndExclusive: new Date("2026-04-06T00:00:00.000Z"),
                weekStartsOn: "MONDAY",
                timeZone: "UTC",
                includeDrafts: false,
                model: "gpt-4.1-mini",
                computed: { b: 2 },
                llmInput: { context: { generatedAt: "2026-04-07T00:00:00.000Z" } },
                ai: { summary: "Weekly summary" },
            },
        ]);

        const response = await getInsightsHistoryResponse(
            "user_1",
            makeHistoryQuery(),
        );

        expect(response.data).toHaveLength(2);
        expect(response.data[0]).toMatchObject({
            id: "weekly_1",
            type: "weekly",
            ai: { summary: "Weekly summary" },
        });
        expect(response.data[1]).toMatchObject({
            id: "pose_1",
            type: "pose",
            ai: { summary: "Pose summary" },
        });
        expect(response.page).toEqual({
            limit: 20,
            hasMore: false,
            nextCursor: null,
        });
    });

    it("includes computed + llmInput debug fields when includeDebug is true", async () => {
        prismaMock.poseInsight.findMany.mockResolvedValue([
            {
                id: "pose_1",
                createdAt: new Date("2026-04-07T00:00:00.000Z"),
                timeframeStart: new Date("2026-03-01T00:00:00.000Z"),
                timeframeEndExclusive: new Date("2026-03-31T00:00:00.000Z"),
                totalDays: 30,
                timeZone: "UTC",
                model: "gpt-4.1-mini",
                computed: { kpi: 1 },
                llmInput: { context: { generatedAt: "2026-04-07T00:00:00.000Z" } },
                ai: { summary: "Pose summary" },
                pose: {
                    id: "pose_ref_1",
                    slug: "pose-a",
                    sanskritName: "Pose A",
                    englishName: null,
                },
            },
        ]);
        prismaMock.weeklyInsight.findMany.mockResolvedValue([]);

        const response = await getInsightsHistoryResponse(
            "user_1",
            makeHistoryQuery({ includeDebug: true }),
        );

        expect(response.data[0]).toMatchObject({
            id: "pose_1",
            type: "pose",
            computed: { kpi: 1 },
            llmInput: { context: { generatedAt: "2026-04-07T00:00:00.000Z" } },
        });
        expect(response.filters.includeDebug).toBe(true);
    });

    it("returns pose insight detail with generation context when includeDebug=true", async () => {
        prismaMock.poseInsight.findFirst.mockResolvedValue({
            id: "pose_1",
            createdAt: new Date("2026-04-07T00:00:00.000Z"),
            updatedAt: new Date("2026-04-07T01:00:00.000Z"),
            model: "gpt-4.1-mini",
            timeframeStart: new Date("2026-03-01T00:00:00.000Z"),
            timeframeEndExclusive: new Date("2026-03-31T00:00:00.000Z"),
            totalDays: 30,
            timeZone: "UTC",
            computed: { computed: true },
            llmInput: { context: { generatedAt: "2026-04-07T00:00:00.000Z" } },
            ai: { summary: "Pose insight summary" },
            pose: {
                id: "pose_ref_1",
                slug: "pose-a",
                sanskritName: "Pose A",
                englishName: null,
            },
        });

        const response = await getInsightDetailResponse(
            "user_1",
            { type: "pose", id: "pose_1" },
            { includeDebug: true },
        );

        expect(response).toMatchObject({
            pose: {
                id: "pose_ref_1",
                slug: "pose-a",
            },
            timeframe: {
                start: "2026-03-01T00:00:00.000Z",
                endExclusive: "2026-03-31T00:00:00.000Z",
                totalDays: 30,
            },
            meta: {
                insightId: "pose_1",
                debugIncluded: true,
                generationContext: { generatedAt: "2026-04-07T00:00:00.000Z" },
                summaryPreview: "Pose insight summary",
            },
            computed: { computed: true },
            llmInput: { context: { generatedAt: "2026-04-07T00:00:00.000Z" } },
        });
    });

    it("throws HttpError(404) when requested weekly insight is missing", async () => {
        prismaMock.weeklyInsight.findFirst.mockResolvedValue(null);

        await expect(
            getInsightDetailResponse(
                "user_1",
                { type: "weekly", id: "weekly_404" },
                { includeDebug: false },
            ),
        ).rejects.toMatchObject({
            status: 404,
            message: "Insight not found",
        } satisfies Partial<HttpError>);
    });
});

