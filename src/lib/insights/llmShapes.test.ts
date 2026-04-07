import {
    buildPoseInsightsLlmInput,
    buildWeeklyInsightsLlmInput,
} from "./llmShapes.js";

describe("insights llmShapes", () => {
    it("fills weekly day parts and truncates note samples", () => {
        const longNote = "x".repeat(300);
        const input = buildWeeklyInsightsLlmInput({
            context: {
                generatedAt: "2026-04-07T00:00:00.000Z",
                timeZone: "UTC",
                week: { start: "2026-03-30T00:00:00.000Z", endExclusive: "2026-04-06T00:00:00.000Z" },
                previousWeek: { start: "2026-03-23T00:00:00.000Z", endExclusive: "2026-03-30T00:00:00.000Z" },
            },
            currentWeek: {
                sessionCount: 1,
                averageOverallScore: 8,
                averageDurationMinutes: 60,
                metricStats: {} as any,
                dayPartSummaries: [
                    {
                        dayPart: "MORNING",
                        sessionCount: 1,
                        averageOverallScore: 8,
                        averagePain: 7,
                        averageFocus: 8,
                    },
                ],
                weekdaySummaries: [],
                noteKeywordCounts: {},
                noteSamples: [{ sessionId: "s1", date: "2026-04-01", overallScore: 8, note: longNote }],
                sessionsWithNotes: 1,
                trackingCoverage: {
                    practicedCardCount: 1,
                    scoredCardCount: 1,
                    analyzedScoredCardCount: 1,
                    skippedScoredCardCount: 0,
                    completeScoredCardCount: 1,
                    incompleteScoredCardCount: 0,
                    scoringCoverageRate: 1,
                    completionRateWithinScored: 1,
                },
                sampleConfidence: "LOW",
            },
            previousWeek: null,
            comparison: {
                hasPreviousWeekData: false,
                sessionCountDelta: 1,
                averageOverallScoreDelta: null,
                averageDurationDeltaMinutes: null,
                scoringCoverageRateDelta: null,
                completionRateWithinScoredDelta: null,
                shiftedDayPart: null,
                noteKeywordDelta: {},
            },
        });

        expect(input.currentWeek.dayPartSummaries).toHaveLength(5);
        const morning = input.currentWeek.dayPartSummaries.find((d) => d.dayPart === "MORNING");
        const evening = input.currentWeek.dayPartSummaries.find((d) => d.dayPart === "EVENING");
        expect(morning?.sessionCount).toBe(1);
        expect(evening?.sessionCount).toBe(0);
        expect(input.currentWeek.noteSamples[0].note.endsWith("...")).toBe(true);
        expect(input.currentWeek.noteSamples[0].note.length).toBe(223);
    });

    it("fills pose day parts and caps timeSeries at 45 rows", () => {
        const timeSeries = Array.from({ length: 50 }, (_, i) => ({
            date: `2026-03-${String((i % 30) + 1).padStart(2, "0")}`,
            sampleCount: 1,
            averageOverallScore: 7,
            averagePain: 8,
            averageFocus: 7,
            averageStability: 7,
        }));

        const input = buildPoseInsightsLlmInput({
            context: {
                generatedAt: "2026-04-07T00:00:00.000Z",
                timeZone: "UTC",
                timeframe: {
                    start: "2026-03-01T00:00:00.000Z",
                    endExclusive: "2026-03-31T00:00:00.000Z",
                    totalDays: 30,
                },
                pose: {
                    id: "pose_1",
                    slug: "pose-a",
                    sanskritName: "Pose A",
                    englishName: null,
                },
            },
            summary: {
                totalSessions: 1,
                totalScoreCards: 1,
                trackingCoverage: {
                    practicedCardCount: 1,
                    scoredCardCount: 1,
                    analyzedScoredCardCount: 1,
                    skippedScoredCardCount: 0,
                    scoringCoverageRate: 1,
                },
                sampleConfidence: "LOW",
                overallScoreStats: { count: 1, average: 7, stdDev: null, min: 7, max: 7, median: 7 },
                metricStats: {} as any,
                sideBreakdown: [],
                byDayPart: [
                    {
                        dayPart: "NIGHT",
                        sampleCount: 1,
                        averageOverallScore: 7,
                        averagePain: 8,
                        averageFocus: 7,
                    },
                ],
                trend: {
                    overallScoreSlopePerDay: 0,
                    painSlopePerDay: 0,
                    focusSlopePerDay: 0,
                },
                noteSignals: {
                    cardsWithNotes: 1,
                    keywords: {},
                    noteSamples: [
                        {
                            date: "2026-03-10T00:00:00.000Z",
                            side: "NA",
                            note: "y".repeat(260),
                        },
                    ],
                },
            },
            timeSeries,
        });

        expect(input.summary.byDayPart).toHaveLength(5);
        const night = input.summary.byDayPart.find((d) => d.dayPart === "NIGHT");
        const morning = input.summary.byDayPart.find((d) => d.dayPart === "MORNING");
        expect(night?.sampleCount).toBe(1);
        expect(morning?.sampleCount).toBe(0);
        expect(input.summary.noteSignals.noteSamples[0].note.endsWith("...")).toBe(true);
        expect(input.timeSeries).toHaveLength(45);
    });
});

