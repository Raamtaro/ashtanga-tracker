import { PracticeType } from "@prisma/client";
import { jest } from "@jest/globals";
import type { Request, Response } from "express";

const prismaMock: any = {
    $transaction: jest.fn(),
};

const resolveCandidatesMock: any = jest.fn();
const parseCandidateResolutionErrorMock: any = jest.fn();
const validateScoredPosesSubsetMock: any = jest.fn();
const buildSessionWithScoreCardsMock: any = jest.fn();
const toCandidateCardResponseMock: any = jest.fn((card: unknown) => card);

jest.unstable_mockModule("../../../lib/prisma.js", () => ({
    default: prismaMock,
}));

jest.unstable_mockModule("./createV3.service.js", () => ({
    resolveCandidates: resolveCandidatesMock,
    parseCandidateResolutionError: parseCandidateResolutionErrorMock,
    validateScoredPosesSubset: validateScoredPosesSubsetMock,
    buildSessionWithScoreCards: buildSessionWithScoreCardsMock,
    toCandidateCardResponse: toCandidateCardResponseMock,
}));

const {
    createCustomSession,
    createPresetSession,
    getSessionV3Candidates,
} = await import("./createV3.js");

function createResMock(): Response {
    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
    };
    return res as unknown as Response;
}

function createReqMock(
    input: Partial<Pick<Request, "body" | "params" | "query" | "user">>,
): Request {
    return input as Request;
}

describe("session createV3 controller", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        parseCandidateResolutionErrorMock.mockReturnValue(null);
        validateScoredPosesSubsetMock.mockReturnValue({
            normalizedScoredPoses: undefined,
            invalidSlugs: [],
        });
        prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb({}));
    });

    it("returns 401 for unauthenticated candidate requests", async () => {
        const req = createReqMock({ body: { mode: "preset", practiceType: PracticeType.FULL_PRIMARY } });
        const res = createResMock();

        await getSessionV3Candidates(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
    });

    it("returns 422 for invalid candidates input", async () => {
        const req = createReqMock({
            user: { id: "user_1" },
            body: { mode: "preset" },
        });
        const res = createResMock();

        await getSessionV3Candidates(req, res);

        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: "Invalid input",
                issues: expect.any(Array),
            }),
        );
    });

    it("returns transformed candidate payload from service", async () => {
        resolveCandidatesMock.mockResolvedValue({
            practiceType: PracticeType.FULL_PRIMARY,
            candidateHash: "hash_1",
            candidateCards: [{ id: "card_1" }],
            poseOptions: [{ slug: "pose-a" }],
            validSlugs: ["pose-a"],
        });
        toCandidateCardResponseMock.mockImplementation((card: any) => ({ transformed: card.id }));

        const req = createReqMock({
            user: { id: "user_1" },
            body: { mode: "preset", practiceType: PracticeType.FULL_PRIMARY },
        });
        const res = createResMock();

        await getSessionV3Candidates(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            practiceType: PracticeType.FULL_PRIMARY,
            candidateHash: "hash_1",
            candidateCards: [{ transformed: "card_1" }],
            poseOptions: [{ slug: "pose-a" }],
        });
    });

    it("returns 409 when provided candidateHash is stale", async () => {
        resolveCandidatesMock.mockResolvedValue({
            practiceType: PracticeType.FULL_PRIMARY,
            candidateHash: "new_hash",
            candidateCards: [],
            poseOptions: [],
            validSlugs: ["pose-a"],
        });

        const req = createReqMock({
            user: { id: "user_1" },
            body: {
                practiceType: PracticeType.FULL_PRIMARY,
                candidateHash: "old_hash",
            },
        });
        const res = createResMock();

        await createPresetSession(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            message: "Candidate pose list is stale. Refresh candidates and retry.",
            candidateHash: "new_hash",
        });
    });

    it("returns 400 when scoredPoses contains invalid slugs", async () => {
        resolveCandidatesMock.mockResolvedValue({
            practiceType: PracticeType.FULL_PRIMARY,
            candidateHash: "hash_1",
            candidateCards: [],
            poseOptions: [],
            validSlugs: ["pose-a", "pose-b"],
        });
        validateScoredPosesSubsetMock.mockReturnValue({
            normalizedScoredPoses: ["pose-a", "pose-z"],
            invalidSlugs: ["pose-z"],
        });

        const req = createReqMock({
            user: { id: "user_1" },
            body: {
                practiceType: PracticeType.FULL_PRIMARY,
                scoredPoses: ["pose-a", "pose-z"],
            },
        });
        const res = createResMock();

        await createPresetSession(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            message: "scoredPoses must be a subset of candidate pose slugs",
            invalidSlugs: ["pose-z"],
            validSlugs: ["pose-a", "pose-b"],
        });
    });

    it("creates preset session in transaction for valid request", async () => {
        resolveCandidatesMock.mockResolvedValue({
            practiceType: PracticeType.FULL_PRIMARY,
            candidateHash: "hash_1",
            candidateCards: [{ id: "candidate_1" }],
            poseOptions: [],
            validSlugs: ["pose-a"],
        });
        validateScoredPosesSubsetMock.mockReturnValue({
            normalizedScoredPoses: ["pose-a"],
            invalidSlugs: [],
        });
        buildSessionWithScoreCardsMock.mockResolvedValue({
            id: "session_1",
            scoreCards: [],
        });

        const req = createReqMock({
            user: { id: "user_1" },
            body: {
                practiceType: PracticeType.FULL_PRIMARY,
                scoredPoses: ["pose-a"],
            },
        });
        const res = createResMock();

        await createPresetSession(req, res);

        expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
        expect(buildSessionWithScoreCardsMock).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: "user_1",
                practiceType: PracticeType.FULL_PRIMARY,
                candidateCards: [{ id: "candidate_1" }],
                scoredPoses: ["pose-a"],
            }),
        );
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            session: {
                id: "session_1",
                scoreCards: [],
            },
        });
    });

    it("uses parseCandidateResolutionError when candidate resolution fails", async () => {
        resolveCandidatesMock.mockRejectedValue(new Error("upToSlug not found: bad"));
        parseCandidateResolutionErrorMock.mockReturnValue({
            status: 422,
            payload: {
                message: "Invalid sequenceSnippets input",
            },
        });

        const req = createReqMock({
            user: { id: "user_1" },
            body: {
                practiceType: PracticeType.CUSTOM,
                sequenceSnippets: [{ group: "PRIMARY", upToSlug: "bad" }],
            },
        });
        const res = createResMock();

        await createCustomSession(req, res);

        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalledWith({
            message: "Invalid sequenceSnippets input",
        });
    });
});

