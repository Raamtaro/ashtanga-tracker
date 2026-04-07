import { jest } from "@jest/globals";
import type { Request, Response } from "express";

const prismaMock: any = {
    practiceSession: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
    },
};

jest.unstable_mockModule("../../../lib/prisma.js", () => ({
    default: prismaMock,
}));

const { getAllSessions, getSessionById, getSessionStats } = await import("./basic.read.js");

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

describe("session basic.read controller", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("getAllSessions returns 401 for unauthenticated requests", async () => {
        const req = createReqMock({ query: {} });
        const res = createResMock();

        await getAllSessions(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
    });

    it("getAllSessions returns paginated results with nextCursor", async () => {
        prismaMock.practiceSession.findMany.mockResolvedValue([
            {
                id: "session_3",
                date: new Date("2026-04-03T00:00:00.000Z"),
                status: "DRAFT",
                label: "Three",
                practiceType: "CUSTOM",
                durationMinutes: null,
                overallScore: null,
                energyLevel: null,
                mood: null,
                notes: null,
            },
            {
                id: "session_2",
                date: new Date("2026-04-02T00:00:00.000Z"),
                status: "DRAFT",
                label: "Two",
                practiceType: "CUSTOM",
                durationMinutes: null,
                overallScore: null,
                energyLevel: null,
                mood: null,
                notes: null,
            },
            {
                id: "session_1",
                date: new Date("2026-04-01T00:00:00.000Z"),
                status: "DRAFT",
                label: "One",
                practiceType: "CUSTOM",
                durationMinutes: null,
                overallScore: null,
                energyLevel: null,
                mood: null,
                notes: null,
            },
        ]);

        const req = createReqMock({
            user: { id: "user_1" },
            query: { limit: "2" },
        });
        const res = createResMock();

        await getAllSessions(req, res);

        expect(prismaMock.practiceSession.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                take: 3,
            }),
        );

        expect(res.json).toHaveBeenCalledWith({
            items: [
                expect.objectContaining({
                    id: "session_3",
                    date: "2026-04-03T00:00:00.000Z",
                }),
                expect.objectContaining({
                    id: "session_2",
                    date: "2026-04-02T00:00:00.000Z",
                }),
            ],
            nextCursor: expect.any(String),
        });
    });

    it("getSessionById returns 404 when session is missing", async () => {
        prismaMock.practiceSession.findFirst.mockResolvedValue(null);

        const req = createReqMock({
            user: { id: "user_1" },
            params: { id: "session_1" },
        });
        const res = createResMock();

        await getSessionById(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Session not found" });
    });

    it("getSessionById returns summary and practiced/scored cards", async () => {
        prismaMock.practiceSession.findFirst.mockResolvedValue({
            id: "session_1",
            status: "DRAFT",
            label: "Morning",
            practiceType: "CUSTOM",
            durationMinutes: 45,
            mood: 7,
            energyLevel: 8,
            notes: "Good session",
            date: new Date("2026-04-07T00:00:00.000Z"),
            overallScore: null,
            scoreCards: [
                {
                    id: "card_1",
                    orderInSession: 1,
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
                        id: "pose_1",
                        slug: "pose-a",
                        sanskritName: "Pose A",
                        englishName: null,
                        sequenceGroup: "STANDING",
                        isTwoSided: false,
                    },
                },
                {
                    id: "card_2",
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
                        slug: "pose-b",
                        sanskritName: "Pose B",
                        englishName: null,
                        sequenceGroup: "STANDING",
                        isTwoSided: false,
                    },
                },
            ],
        });

        const req = createReqMock({
            user: { id: "user_1" },
            params: { id: "session_1" },
        });
        const res = createResMock();

        await getSessionById(req, res);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                session: expect.objectContaining({
                    id: "session_1",
                    date: "2026-04-07T00:00:00.000Z",
                    practicedCards: expect.any(Array),
                    scoredCards: expect.any(Array),
                    summary: expect.objectContaining({
                        totalScoreCards: 2,
                        scoredScoreCards: 1,
                        unscoredScoreCards: 1,
                        incompleteScoreCards: 1,
                    }),
                }),
            }),
        );
    });

    it("getSessionStats returns computed summary and segmented stats", async () => {
        prismaMock.practiceSession.findFirst.mockResolvedValue({
            id: "session_1",
            status: "PUBLISHED",
            date: new Date("2026-04-07T00:00:00.000Z"),
            label: "Morning",
            practiceType: "CUSTOM",
            durationMinutes: 45,
            overallScore: 7.5,
            scoreCards: [
                {
                    id: "card_1",
                    scored: true,
                    skipped: false,
                    segment: "STANDING",
                    side: "LEFT",
                    overallScore: 7,
                    ease: 7,
                    comfort: 7,
                    stability: 7,
                    pain: 8,
                    breath: 7,
                    focus: 6,
                },
                {
                    id: "card_2",
                    scored: true,
                    skipped: true,
                    segment: "STANDING",
                    side: "RIGHT",
                    overallScore: null,
                    ease: null,
                    comfort: null,
                    stability: null,
                    pain: null,
                    breath: null,
                    focus: null,
                },
            ],
        });

        const req = createReqMock({
            user: { id: "user_1" },
            params: { id: "session_1" },
        });
        const res = createResMock();

        await getSessionStats(req, res);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                summary: expect.objectContaining({
                    totalScoreCards: 2,
                    scoredScoreCards: 2,
                    activeScoreCards: 1,
                    skippedScoreCards: 1,
                }),
                statistics: expect.objectContaining({
                    bySegment: expect.arrayContaining([
                        expect.objectContaining({
                            key: "STANDING",
                            count: 1,
                        }),
                    ]),
                    bySide: expect.arrayContaining([
                        expect.objectContaining({
                            key: "LEFT",
                            count: 1,
                        }),
                    ]),
                }),
            }),
        );
    });
});

