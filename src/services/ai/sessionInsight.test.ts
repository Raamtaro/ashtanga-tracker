import { jest } from "@jest/globals";

const prismaMock: any = {
    practiceSession: {
        findFirst: jest.fn(),
    },
};

const openAiCreateMock: any = jest.fn();

jest.unstable_mockModule("../../lib/prisma.js", () => ({
    default: prismaMock,
}));

jest.unstable_mockModule("../../lib/openai.js", () => ({
    openai: {
        chat: {
            completions: {
                create: openAiCreateMock,
            },
        },
    },
}));

const { getSessionAiInsightResponse } = await import("./sessionInsight.js");

describe("ai sessionInsight service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("throws 404 when session is not found", async () => {
        prismaMock.practiceSession.findFirst.mockResolvedValue(null);

        await expect(
            getSessionAiInsightResponse("user_1", "session_404"),
        ).rejects.toMatchObject({
            status: 404,
            message: "Session not found",
        });

        expect(openAiCreateMock).not.toHaveBeenCalled();
    });

    it("returns computed session insight payload and parsed ai response", async () => {
        prismaMock.practiceSession.findFirst.mockResolvedValue({
            id: "session_1",
            status: "DRAFT",
            date: new Date("2026-04-07T00:00:00.000Z"),
            overallScore: null,
            label: "Morning Practice",
            practiceType: "CUSTOM",
            durationMinutes: 45,
            scoreCards: [
                {
                    id: "card_1",
                    side: "NA",
                    scored: true,
                    skipped: false,
                    overallScore: 7.5,
                    notes: "steady breath",
                    ease: 8,
                    comfort: 7,
                    stability: 8,
                    pain: 7,
                    breath: 8,
                    focus: 7,
                    pose: {
                        sanskritName: "Pose A",
                        sequenceGroup: "STANDING",
                        slug: "pose-a",
                    },
                },
                {
                    id: "card_2",
                    side: "LEFT",
                    scored: false,
                    skipped: false,
                    overallScore: null,
                    notes: null,
                    ease: null,
                    comfort: null,
                    stability: null,
                    pain: null,
                    breath: null,
                    focus: null,
                    pose: {
                        sanskritName: "Pose B",
                        sequenceGroup: "STANDING",
                        slug: "pose-b",
                    },
                },
            ],
        });

        const aiJson = {
            summary: "Good session",
            insights: ["Solid consistency"],
            redFlags: [],
            followUps: ["How was sleep?"],
        };
        openAiCreateMock.mockResolvedValue({
            model: "gpt-4.1-mini",
            choices: [
                {
                    message: {
                        content: JSON.stringify(aiJson),
                    },
                },
            ],
        });

        const response = await getSessionAiInsightResponse("user_1", "session_1");

        expect(openAiCreateMock).toHaveBeenCalledTimes(1);
        expect(response.session).toEqual({
            id: "session_1",
            status: "DRAFT",
            date: "2026-04-07T00:00:00.000Z",
            overallScore: null,
            summary: {
                total: 2,
                complete: 2,
                incomplete: 0,
                firstIncompleteScoreCardId: null,
                scoredTotal: 1,
                unscoredTotal: 1,
                analyzedScoredTotal: 1,
                skippedScoredTotal: 0,
                sampleConfidence: "LOW",
            },
        });
        expect(response.computed.metricAverages).toEqual({
            ease: 8,
            comfort: 7,
            stability: 8,
            pain: 7,
            breath: 8,
            focus: 7,
        });
        expect(response.ai).toEqual(aiJson);
        expect(response.debug.model).toBe("gpt-4.1-mini");
    });
});

