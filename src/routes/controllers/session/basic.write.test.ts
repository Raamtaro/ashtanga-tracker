import { jest } from "@jest/globals";
import type { Request, Response } from "express";

const prismaMock: any = {
    practiceSession: {
        findFirst: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
};

const runPublishWorkflowMock: any = jest.fn();

jest.unstable_mockModule("../../../lib/prisma.js", () => ({
    default: prismaMock,
}));

jest.unstable_mockModule("./publishSession.service.js", () => ({
    runPublishWorkflow: runPublishWorkflowMock,
}));

const { deleteSession, publishSession, updateSessionById } = await import("./basic.write.js");

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

describe("session basic.write controller", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("updateSessionById returns 401 for unauthenticated requests", async () => {
        const req = createReqMock({ params: { id: "session_1" }, body: { label: "New Label" } });
        const res = createResMock();

        await updateSessionById(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
    });

    it("updateSessionById returns 422 for invalid body", async () => {
        const req = createReqMock({
            user: { id: "user_1" },
            params: { id: "session_1" },
            body: {},
        });
        const res = createResMock();

        await updateSessionById(req, res);

        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: "Invalid input",
            }),
        );
    });

    it("updateSessionById updates draft session and serializes date", async () => {
        prismaMock.practiceSession.findFirst.mockResolvedValue({
            id: "session_1",
            status: "DRAFT",
        });
        prismaMock.practiceSession.update.mockResolvedValue({
            id: "session_1",
            status: "DRAFT",
            label: "Updated Label",
            practiceType: "CUSTOM",
            durationMinutes: 50,
            overallScore: null,
            energyLevel: null,
            mood: null,
            notes: null,
            date: new Date("2026-04-07T00:00:00.000Z"),
        });

        const req = createReqMock({
            user: { id: "user_1" },
            params: { id: "session_1" },
            body: { label: "Updated Label", durationMinutes: 50 },
        });
        const res = createResMock();

        await updateSessionById(req, res);

        expect(prismaMock.practiceSession.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "session_1" },
                data: expect.objectContaining({
                    label: "Updated Label",
                    durationMinutes: 50,
                }),
            }),
        );

        expect(res.json).toHaveBeenCalledWith({
            session: expect.objectContaining({
                id: "session_1",
                label: "Updated Label",
                date: "2026-04-07T00:00:00.000Z",
            }),
        });
    });

    it("publishSession maps incomplete workflow to 409", async () => {
        prismaMock.$transaction.mockImplementation(
            async (cb: (tx: unknown) => Promise<unknown>) => cb({}),
        );
        runPublishWorkflowMock.mockResolvedValue({
            kind: "incomplete",
            error: {
                message: "Cannot publish",
                scoreCardId: "card_1",
                pose: { sanskritName: "Pose A", slug: "pose-a" },
                side: "LEFT",
                missing: ["comfort"],
            },
        });

        const req = createReqMock({
            user: { id: "user_1" },
            params: { id: "session_1" },
        });
        const res = createResMock();

        await publishSession(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            message: "Cannot publish",
            scoreCardId: "card_1",
            pose: { sanskritName: "Pose A", slug: "pose-a" },
            side: "LEFT",
            missing: ["comfort"],
        });
    });

    it("publishSession maps successful workflow response", async () => {
        prismaMock.$transaction.mockImplementation(
            async (cb: (tx: unknown) => Promise<unknown>) => cb({}),
        );
        runPublishWorkflowMock.mockResolvedValue({
            kind: "ok",
            session: {
                id: "session_1",
                status: "PUBLISHED",
                date: new Date("2026-04-07T00:00:00.000Z"),
                overallScore: 8.25,
            },
        });

        const req = createReqMock({
            user: { id: "user_1" },
            params: { id: "session_1" },
        });
        const res = createResMock();

        await publishSession(req, res);

        expect(res.json).toHaveBeenCalledWith({
            session: {
                id: "session_1",
                status: "PUBLISHED",
                date: "2026-04-07T00:00:00.000Z",
                overallScore: 8.25,
            },
        });
    });

    it("deleteSession returns 404 when no row is deleted", async () => {
        prismaMock.practiceSession.deleteMany.mockResolvedValue({ count: 0 });

        const req = createReqMock({
            user: { id: "user_1" },
            params: { id: "session_1" },
        });
        const res = createResMock();

        await deleteSession(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({
            error: "Session not found or no permission",
        });
    });

    it("deleteSession returns success message when deleted", async () => {
        prismaMock.practiceSession.deleteMany.mockResolvedValue({ count: 1 });

        const req = createReqMock({
            user: { id: "user_1" },
            params: { id: "session_1" },
        });
        const res = createResMock();

        await deleteSession(req, res);

        expect(res.json).toHaveBeenCalledWith({ message: "Session deleted" });
    });
});

