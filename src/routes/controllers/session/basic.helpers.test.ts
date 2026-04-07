import {
    buildSessionViewerSummary,
    computeCardOverall,
    decodeCursor,
    encodeCursor,
    toSessionViewerCards,
} from "./basic.helpers.js";

describe("basic.helpers", () => {
    it("encodeCursor/decodeCursor roundtrip and invalid decode", () => {
        const encoded = encodeCursor({ d: "2026-04-01T00:00:00.000Z", id: "session_123" });
        const decoded = decodeCursor(encoded);
        expect(decoded).toEqual({ d: "2026-04-01T00:00:00.000Z", id: "session_123" });

        const invalid = decodeCursor("not-a-valid-cursor");
        expect(invalid).toBeUndefined();
    });

    it("computeCardOverall returns null when no numeric metrics exist", () => {
        const result = computeCardOverall({
            ease: null,
            comfort: null,
            stability: null,
            pain: null,
            breath: null,
            focus: null,
        });
        expect(result).toBeNull();
    });

    it("computeCardOverall averages only numeric metrics and rounds to 2 decimals", () => {
        const result = computeCardOverall({
            ease: 8,
            comfort: 7,
            stability: 7,
            pain: 9,
            breath: null,
            focus: 6,
        });
        expect(result).toBe(7.4);
    });

    it("toSessionViewerCards computes completion and UI flags based on scored/skipped/status", () => {
        const cards = toSessionViewerCards(
            [
                {
                    id: "card_scored_incomplete",
                    orderInSession: 1,
                    segment: "STANDING",
                    side: "NA",
                    scored: true,
                    skipped: false,
                    overallScore: null,
                    ease: 8,
                    comfort: null,
                    stability: 7,
                    pain: 6,
                    breath: 7,
                    focus: 7,
                    pose: {
                        id: "pose_1",
                        slug: "utthita-trikonasana",
                        sanskritName: "Utthita Trikonasana",
                        englishName: "Extended Triangle Pose",
                        sequenceGroup: "STANDING",
                        isTwoSided: true,
                    },
                },
                {
                    id: "card_unscored",
                    orderInSession: 2,
                    segment: "STANDING",
                    side: "NA",
                    scored: false,
                    skipped: false,
                    overallScore: null,
                    ease: null,
                    comfort: null,
                    stability: null,
                    pain: null,
                    breath: null,
                    focus: null,
                    pose: {
                        id: "pose_2",
                        slug: "tadasana",
                        sanskritName: "Tadasana",
                        englishName: "Mountain Pose",
                        sequenceGroup: "STANDING",
                        isTwoSided: false,
                    },
                },
                {
                    id: "card_scored_skipped",
                    orderInSession: 3,
                    segment: "STANDING",
                    side: "NA",
                    scored: true,
                    skipped: true,
                    overallScore: null,
                    ease: null,
                    comfort: null,
                    stability: null,
                    pain: null,
                    breath: null,
                    focus: null,
                    pose: {
                        id: "pose_3",
                        slug: "uttanasana",
                        sanskritName: "Uttanasana",
                        englishName: "Forward Fold",
                        sequenceGroup: "STANDING",
                        isTwoSided: false,
                    },
                },
            ],
            "DRAFT",
        );

        expect(cards[0].isComplete).toBe(false);
        expect(cards[0].canEditScore).toBe(true);
        expect(cards[0].canToggleSkipped).toBe(false);

        expect(cards[1].isComplete).toBe(true);
        expect(cards[1].canEditScore).toBe(false);
        expect(cards[1].canToggleSkipped).toBe(true);

        expect(cards[2].isComplete).toBe(true);
        expect(cards[2].canEditScore).toBe(true);
        expect(cards[2].canToggleSkipped).toBe(false);
    });

    it("buildSessionViewerSummary returns scored-focused and legacy counters", () => {
        const practicedCards = toSessionViewerCards(
            [
                {
                    id: "complete_scored",
                    orderInSession: 1,
                    segment: "STANDING",
                    side: "NA",
                    scored: true,
                    skipped: false,
                    overallScore: 8,
                    ease: 8,
                    comfort: 8,
                    stability: 8,
                    pain: 8,
                    breath: 8,
                    focus: 8,
                    pose: {
                        id: "pose_a",
                        slug: "a",
                        sanskritName: "A",
                        englishName: null,
                        sequenceGroup: "STANDING",
                        isTwoSided: false,
                    },
                },
                {
                    id: "incomplete_scored",
                    orderInSession: 2,
                    segment: "STANDING",
                    side: "NA",
                    scored: true,
                    skipped: false,
                    overallScore: null,
                    ease: 8,
                    comfort: null,
                    stability: 8,
                    pain: 8,
                    breath: 8,
                    focus: 8,
                    pose: {
                        id: "pose_b",
                        slug: "b",
                        sanskritName: "B",
                        englishName: null,
                        sequenceGroup: "STANDING",
                        isTwoSided: false,
                    },
                },
                {
                    id: "unscored",
                    orderInSession: 3,
                    segment: "STANDING",
                    side: "NA",
                    scored: false,
                    skipped: false,
                    overallScore: null,
                    ease: null,
                    comfort: null,
                    stability: null,
                    pain: null,
                    breath: null,
                    focus: null,
                    pose: {
                        id: "pose_c",
                        slug: "c",
                        sanskritName: "C",
                        englishName: null,
                        sequenceGroup: "STANDING",
                        isTwoSided: false,
                    },
                },
            ],
            "DRAFT",
        );

        const summary = buildSessionViewerSummary(practicedCards);

        expect(summary.totalScoreCards).toBe(3);
        expect(summary.scoredScoreCards).toBe(2);
        expect(summary.unscoredScoreCards).toBe(1);
        expect(summary.activeScoreCards).toBe(2);
        expect(summary.completeScoreCards).toBe(1);
        expect(summary.incompleteScoreCards).toBe(1);
        expect(summary.firstIncompleteScoreCardId).toBe("incomplete_scored");
        expect(summary.total).toBe(3); // legacy key
    });
});
