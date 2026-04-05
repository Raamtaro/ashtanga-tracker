import { type MetricKey } from "../constants.js";
import { DAY_PARTS, type DayPart, type NumericStats } from "./helpers.js";

export type WeeklyDayPartSummary = {
    dayPart: DayPart;
    sessionCount: number;
    averageOverallScore: number | null;
    averagePain: number | null;
    averageFocus: number | null;
};

export type WeeklyWeekdaySummary = {
    weekday: string;
    sessionCount: number;
    averageOverallScore: number | null;
};

export type WeeklyNoteSample = {
    sessionId: string;
    date: string;
    overallScore: number | null;
    note: string;
};

export type ConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";

export type TrackingCoverage = {
    practicedCardCount: number;
    scoredCardCount: number;
    analyzedScoredCardCount: number;
    skippedScoredCardCount: number;
    completeScoredCardCount: number;
    incompleteScoredCardCount: number;
    scoringCoverageRate: number | null;
    completionRateWithinScored: number | null;
};

export type WeeklyRollup = {
    sessionCount: number;
    averageOverallScore: number | null;
    averageDurationMinutes: number | null;
    metricStats: Record<MetricKey, NumericStats>;
    dayPartSummaries: WeeklyDayPartSummary[];
    weekdaySummaries: WeeklyWeekdaySummary[];
    noteKeywordCounts: Record<string, number>;
    noteSamples: WeeklyNoteSample[];
    sessionsWithNotes: number;
    trackingCoverage: TrackingCoverage;
    sampleConfidence: ConfidenceLevel;
};

export type WeeklyComparison = {
    hasPreviousWeekData: boolean;
    sessionCountDelta: number;
    averageOverallScoreDelta: number | null;
    averageDurationDeltaMinutes: number | null;
    scoringCoverageRateDelta: number | null;
    completionRateWithinScoredDelta: number | null;
    shiftedDayPart: {
        dayPart: DayPart;
        sessionDelta: number;
    } | null;
    noteKeywordDelta: Record<string, number>;
};

export interface WeeklyInsightsLlmInput {
    context: {
        generatedAt: string;
        timeZone: string;
        week: {
            start: string;
            endExclusive: string;
        };
        previousWeek: {
            start: string;
            endExclusive: string;
        };
    };
    currentWeek: WeeklyRollup;
    previousWeek: WeeklyRollup | null;
    comparison: WeeklyComparison;
}

export type PoseTimeSeriesPoint = {
    date: string;
    sampleCount: number;
    averageOverallScore: number | null;
    averagePain: number | null;
    averageFocus: number | null;
    averageStability: number | null;
};

export interface PoseInsightsLlmInput {
    context: {
        generatedAt: string;
        timeZone: string;
        timeframe: {
            start: string;
            endExclusive: string;
            totalDays: number;
        };
        pose: {
            id: string;
            slug: string;
            sanskritName: string;
            englishName: string | null;
        };
    };
    summary: {
        totalSessions: number;
        totalScoreCards: number;
        trackingCoverage: {
            practicedCardCount: number;
            scoredCardCount: number;
            analyzedScoredCardCount: number;
            skippedScoredCardCount: number;
            scoringCoverageRate: number | null;
        };
        sampleConfidence: ConfidenceLevel;
        overallScoreStats: NumericStats;
        metricStats: Record<MetricKey, NumericStats>;
        sideBreakdown: Array<{
            side: string;
            sampleCount: number;
            overallScoreStats: NumericStats;
            painStats: NumericStats;
            focusStats: NumericStats;
        }>;
        byDayPart: Array<{
            dayPart: DayPart;
            sampleCount: number;
            averageOverallScore: number | null;
            averagePain: number | null;
            averageFocus: number | null;
        }>;
        trend: {
            overallScoreSlopePerDay: number | null;
            painSlopePerDay: number | null;
            focusSlopePerDay: number | null;
        };
        noteSignals: {
            cardsWithNotes: number;
            keywords: Record<string, number>;
            noteSamples: Array<{
                date: string;
                side: string | null;
                note: string;
            }>;
        };
    };
    timeSeries: PoseTimeSeriesPoint[];
}

function truncateNote(note: string, maxLen = 220): string {
    if (note.length <= maxLen) return note;
    return `${note.slice(0, maxLen)}...`;
}

export function buildWeeklyInsightsLlmInput(input: WeeklyInsightsLlmInput): WeeklyInsightsLlmInput {
    return {
        ...input,
        currentWeek: {
            ...input.currentWeek,
            dayPartSummaries: DAY_PARTS.map((part) => (
                input.currentWeek.dayPartSummaries.find((item) => item.dayPart === part)
                ?? {
                    dayPart: part,
                    sessionCount: 0,
                    averageOverallScore: null,
                    averagePain: null,
                    averageFocus: null,
                }
            )),
            noteSamples: input.currentWeek.noteSamples
                .slice(0, 8)
                .map((sample) => ({ ...sample, note: truncateNote(sample.note) })),
        },
        previousWeek: input.previousWeek
            ? {
                ...input.previousWeek,
                dayPartSummaries: DAY_PARTS.map((part) => (
                    input.previousWeek?.dayPartSummaries.find((item) => item.dayPart === part)
                    ?? {
                        dayPart: part,
                        sessionCount: 0,
                        averageOverallScore: null,
                        averagePain: null,
                        averageFocus: null,
                    }
                )),
                noteSamples: input.previousWeek.noteSamples
                    .slice(0, 8)
                    .map((sample) => ({ ...sample, note: truncateNote(sample.note) })),
            }
            : null,
    };
}

export function buildPoseInsightsLlmInput(input: PoseInsightsLlmInput): PoseInsightsLlmInput {
    return {
        ...input,
        summary: {
            ...input.summary,
            byDayPart: DAY_PARTS.map((part) => (
                input.summary.byDayPart.find((item) => item.dayPart === part)
                ?? {
                    dayPart: part,
                    sampleCount: 0,
                    averageOverallScore: null,
                    averagePain: null,
                    averageFocus: null,
                }
            )),
            noteSignals: {
                ...input.summary.noteSignals,
                noteSamples: input.summary.noteSignals.noteSamples
                    .slice(0, 8)
                    .map((sample) => ({ ...sample, note: truncateNote(sample.note) })),
            },
        },
        timeSeries: input.timeSeries.slice(0, 45),
    };
}
