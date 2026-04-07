import { PracticeType } from "@prisma/client";
import { jest } from "@jest/globals";

import {
    buildSessionWithScoreCards,
    parseCandidateResolutionError,
    toCandidateCardResponse,
    validateScoredPosesSubset,
    type ResolvedCandidateCard,
} from "./createV3.service.js";

describe("createV3.service", () => {
    it("validates scored poses as subset of candidate slugs", () => {
        const result = validateScoredPosesSubset(
            [" pose-a ", "pose-a", "pose-b", "pose-x", ""],
            ["pose-a", "pose-b", "pose-c"],
        );

        expect(result.normalizedScoredPoses).toEqual(["pose-a", "pose-b", "pose-x"]);
        expect(result.invalidSlugs).toEqual(["pose-x"]);
    });

    it("parses only known candidate resolution errors", () => {
        const handled = parseCandidateResolutionError(new Error("upToSlug not found: pincha"));
        expect(handled).toEqual({
            status: 422,
            payload: {
                message: "Invalid sequenceSnippets input",
                detail: "upToSlug not found: pincha",
            },
        });

        const unhandled = parseCandidateResolutionError(new Error("other"));
        expect(unhandled).toBeNull();
    });

    it("omits db-only fields from candidate card response", () => {
        const card: ResolvedCandidateCard = {
            orderInSession: 1,
            poseId: "pose_1",
            slug: "utthita-trikonasana",
            sanskritName: "Utthita Trikonasana",
            englishName: "Extended Triangle Pose",
            sequenceGroup: "STANDING",
            segment: "STANDING",
            side: "RIGHT",
            isTwoSided: true,
        };

        expect(toCandidateCardResponse(card)).toEqual({
            orderInSession: 1,
            slug: "utthita-trikonasana",
            sanskritName: "Utthita Trikonasana",
            englishName: "Extended Triangle Pose",
            sequenceGroup: "STANDING",
            segment: "STANDING",
            side: "RIGHT",
        });
    });

    it("creates scorecards with scored flag based on selected pose slugs", async () => {
        const practiceSessionCreate = jest.fn(async () => ({ id: "session_1" }));
        const scoreCardCreateMany = jest.fn(async () => ({ count: 3 }));
        const practiceSessionFindUnique = jest.fn(async () => ({
            id: "session_1",
            date: new Date("2026-04-07T00:00:00.000Z"),
            label: "Custom Practice",
            overallScore: null,
            energyLevel: null,
            mood: null,
            notes: null,
            practiceType: PracticeType.CUSTOM,
            durationMinutes: 45,
            scoreCards: [],
        }));

        const tx = {
            practiceSession: {
                create: practiceSessionCreate,
                findUnique: practiceSessionFindUnique,
            },
            scoreCard: {
                createMany: scoreCardCreateMany,
            },
        } as any;

        const candidateCards: ResolvedCandidateCard[] = [
            {
                orderInSession: 1,
                poseId: "pose_a",
                slug: "pose-a",
                sanskritName: "Pose A",
                englishName: null,
                sequenceGroup: "PRIMARY",
                segment: "PRIMARY",
                side: "RIGHT",
                isTwoSided: true,
            },
            {
                orderInSession: 2,
                poseId: "pose_a",
                slug: "pose-a",
                sanskritName: "Pose A",
                englishName: null,
                sequenceGroup: "PRIMARY",
                segment: "PRIMARY",
                side: "LEFT",
                isTwoSided: true,
            },
            {
                orderInSession: 3,
                poseId: "pose_b",
                slug: "pose-b",
                sanskritName: "Pose B",
                englishName: null,
                sequenceGroup: "PRIMARY",
                segment: "PRIMARY",
                side: "NA",
                isTwoSided: false,
            },
        ];

        await buildSessionWithScoreCards({
            tx,
            userId: "user_1",
            practiceType: PracticeType.CUSTOM,
            duration: 45,
            label: "Custom Practice",
            candidateCards,
            scoredPoses: ["pose-a"],
        });

        expect(practiceSessionCreate).toHaveBeenCalledTimes(1);
        expect(scoreCardCreateMany).toHaveBeenCalledTimes(1);
        expect(practiceSessionFindUnique).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "session_1" },
            }),
        );

        expect(scoreCardCreateMany).toHaveBeenCalledWith({
            data: [
                expect.objectContaining({ poseId: "pose_a", side: "RIGHT", scored: true }),
                expect.objectContaining({ poseId: "pose_a", side: "LEFT", scored: true }),
                expect.objectContaining({ poseId: "pose_b", side: "NA", scored: false }),
            ],
        });
    });
});
