import { jest } from "@jest/globals";
import {
    HttpError,
    buildWeeklyComparison,
    buildWeeklyRollup,
    getSampleConfidence,
    painSeverityFromAverage,
    painSeverityFromScore,
    resolvePoseWindow,
    resolveWeeklyWindow,
    toPainSeverityStats,
    type WeeklyInsightsBody,
} from "./shared.js";

function makeWeeklyInput(overrides?: Partial<WeeklyInsightsBody>): WeeklyInsightsBody {
    return {
        weekStartDate: undefined,
        weekStartsOn: "MONDAY",
        timeZone: "UTC",
        includeDrafts: false,
        ...overrides,
    };
}

describe("ai/shared helpers", () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    it("maps pain score to severity using inverse scale", () => {
        expect(painSeverityFromScore(10)).toBe(1);
        expect(painSeverityFromScore(1)).toBe(10);
        expect(painSeverityFromScore(null)).toBeNull();
        expect(painSeverityFromAverage(7.5)).toBe(3.5);
    });

    it("transforms pain stats into severity stats", () => {
        const stats = toPainSeverityStats({
            count: 4,
            average: 8,
            stdDev: 0.5,
            min: 7,
            max: 9,
            median: 8,
        });

        expect(stats).toEqual({
            count: 4,
            average: 3,
            stdDev: 0.5,
            min: 2,
            max: 4,
            median: 3,
        });
    });

    it("returns confidence bands by sample count", () => {
        expect(getSampleConfidence(0)).toBe("LOW");
        expect(getSampleConfidence(3)).toBe("LOW");
        expect(getSampleConfidence(4)).toBe("MEDIUM");
        expect(getSampleConfidence(9)).toBe("MEDIUM");
        expect(getSampleConfidence(10)).toBe("HIGH");
    });

    it("resolves default weekly window as previous complete week", () => {
        jest.useFakeTimers({ now: Date.parse("2026-04-07T15:00:00.000Z") });

        const window = resolveWeeklyWindow(makeWeeklyInput());

        expect(window.currentStart.toISOString()).toBe("2026-03-30T00:00:00.000Z");
        expect(window.currentEndExclusive.toISOString()).toBe("2026-04-06T00:00:00.000Z");
        expect(window.previousStart.toISOString()).toBe("2026-03-23T00:00:00.000Z");
        expect(window.previousEndExclusive.toISOString()).toBe("2026-03-30T00:00:00.000Z");
    });

    it("falls back invalid weekly timezone input to UTC", () => {
        const window = resolveWeeklyWindow(
            makeWeeklyInput({
                weekStartDate: new Date("2026-04-01T20:32:11.000Z"),
                timeZone: "Invalid/Zone",
            }),
        );

        expect(window.currentStart.toISOString()).toBe("2026-04-01T00:00:00.000Z");
        expect(window.currentEndExclusive.toISOString()).toBe("2026-04-08T00:00:00.000Z");
        expect(window.previousStart.toISOString()).toBe("2026-03-25T00:00:00.000Z");
        expect(window.previousEndExclusive.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    });

    it("resolves pose window for explicit start/end boundaries", () => {
        const window = resolvePoseWindow({
            startDate: new Date("2026-04-01T16:00:00.000Z"),
            endDate: new Date("2026-04-03T01:00:00.000Z"),
            timeZone: "UTC",
        });

        expect(window.start.toISOString()).toBe("2026-04-01T00:00:00.000Z");
        expect(window.endExclusive.toISOString()).toBe("2026-04-04T00:00:00.000Z");
        expect(window.totalDays).toBe(3);
    });

    it("rejects pose windows larger than max days", () => {
        expect(() =>
            resolvePoseWindow({
                startDate: new Date("2026-01-01T00:00:00.000Z"),
                endDate: new Date("2026-04-10T00:00:00.000Z"),
                timeZone: "UTC",
            }),
        ).toThrow(HttpError);

        try {
            resolvePoseWindow({
                startDate: new Date("2026-01-01T00:00:00.000Z"),
                endDate: new Date("2026-04-10T00:00:00.000Z"),
                timeZone: "UTC",
            });
            throw new Error("expected an HttpError");
        } catch (error) {
            expect(error).toBeInstanceOf(HttpError);
            expect((error as HttpError).status).toBe(422);
        }
    });

    it("resolves pose window using default day count ending on today", () => {
        jest.useFakeTimers({ now: Date.parse("2026-04-07T10:30:00.000Z") });

        const window = resolvePoseWindow({ timeZone: "UTC" });

        expect(window.start.toISOString()).toBe("2026-03-09T00:00:00.000Z");
        expect(window.endExclusive.toISOString()).toBe("2026-04-08T00:00:00.000Z");
        expect(window.totalDays).toBe(30);
    });

    it("builds weekly rollup and comparison deltas", () => {
        const currentRollup = buildWeeklyRollup(
            [
                {
                    id: "s1",
                    date: new Date("2026-04-07T18:00:00.000Z"),
                    overallScore: 8,
                    durationMinutes: 60,
                    notes: "hamstring felt tight",
                    scoreCards: [
                        {
                            notes: "steady breath",
                            ease: 8,
                            comfort: 8,
                            stability: 8,
                            pain: 7,
                            breath: 8,
                            focus: 7,
                        },
                    ],
                },
            ],
            "UTC",
            {
                practicedCardCount: 10,
                scoredCardCount: 8,
                analyzedScoredCardCount: 8,
                skippedScoredCardCount: 0,
                completeScoredCardCount: 8,
                incompleteScoredCardCount: 0,
                scoringCoverageRate: 0.8,
                completionRateWithinScored: 1,
            },
        );

        const previousRollup = buildWeeklyRollup(
            [
                {
                    id: "s0",
                    date: new Date("2026-03-31T09:00:00.000Z"),
                    overallScore: 7,
                    durationMinutes: 50,
                    notes: "low energy",
                    scoreCards: [
                        {
                            notes: null,
                            ease: 7,
                            comfort: 7,
                            stability: 7,
                            pain: 8,
                            breath: 7,
                            focus: 6,
                        },
                    ],
                },
            ],
            "UTC",
            {
                practicedCardCount: 10,
                scoredCardCount: 6,
                analyzedScoredCardCount: 6,
                skippedScoredCardCount: 0,
                completeScoredCardCount: 6,
                incompleteScoredCardCount: 0,
                scoringCoverageRate: 0.6,
                completionRateWithinScored: 1,
            },
        );

        expect(currentRollup.sessionCount).toBe(1);
        expect(currentRollup.averageOverallScore).toBe(8);
        expect(currentRollup.sessionsWithNotes).toBe(1);
        expect(currentRollup.sampleConfidence).toBe("MEDIUM");

        const comparison = buildWeeklyComparison(currentRollup, previousRollup);

        expect(comparison.hasPreviousWeekData).toBe(true);
        expect(comparison.sessionCountDelta).toBe(0);
        expect(comparison.averageOverallScoreDelta).toBe(1);
        expect(comparison.averageDurationDeltaMinutes).toBe(10);
        expect(comparison.scoringCoverageRateDelta).toBe(0.2);
        expect(comparison.completionRateWithinScoredDelta).toBe(0);
        expect(comparison.shiftedDayPart).toEqual({
            dayPart: "MORNING",
            sessionDelta: -1,
        });
    });
});
