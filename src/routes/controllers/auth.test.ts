import { jest } from "@jest/globals";
import type { NextFunction, Request, Response } from "express";

const prismaMock: any = {
    user: {
        findUnique: jest.fn(),
        create: jest.fn(),
    },
    $transaction: jest.fn(),
};

const bcryptHashMock: any = jest.fn();
const bcryptCompareMock: any = jest.fn();
const jwtSignMock: any = jest.fn();
const passportAuthenticateMock: any = jest.fn();

jest.unstable_mockModule("../../lib/prisma.js", () => ({
    default: prismaMock,
}));

jest.unstable_mockModule("bcryptjs", () => ({
    default: {
        hash: bcryptHashMock,
        compare: bcryptCompareMock,
    },
}));

jest.unstable_mockModule("jsonwebtoken", () => ({
    default: {
        sign: jwtSignMock,
    },
}));

jest.unstable_mockModule("passport", () => ({
    default: {
        authenticate: passportAuthenticateMock,
    },
}));

const { deleteAccount, loginUser, signup } = await import("./auth.js");

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

describe("auth controller", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("signup returns 400 for missing required fields", async () => {
        const req = createReqMock({ body: {} });
        const res = createResMock();

        await signup(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: "Please include email, password and name",
        });
        expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });

    it("signup returns 400 when email already exists", async () => {
        prismaMock.user.findUnique.mockResolvedValue({
            id: "user_1",
            email: "test@example.com",
        });

        const req = createReqMock({
            body: {
                name: "Test User",
                email: "test@example.com",
                password: "secret",
            },
        });
        const res = createResMock();

        await signup(req, res);

        expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
            where: { email: "test@example.com" },
        });
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: "An account with test@example.com already exists",
        });
    });

    it("signup hashes password and returns public user", async () => {
        prismaMock.user.findUnique.mockResolvedValue(null);
        bcryptHashMock.mockResolvedValue("hashed_pw");
        prismaMock.user.create.mockResolvedValue({
            id: "user_2",
            email: "new@example.com",
            name: "New User",
        });

        const req = createReqMock({
            body: {
                name: "New User",
                email: "new@example.com",
                password: "secret",
            },
        });
        const res = createResMock();

        await signup(req, res);

        expect(bcryptHashMock).toHaveBeenCalledWith("secret", 11);
        expect(prismaMock.user.create).toHaveBeenCalledWith({
            data: {
                name: "New User",
                email: "new@example.com",
                password: "hashed_pw",
            },
            select: {
                id: true,
                email: true,
                name: true,
            },
        });
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            user: {
                id: "user_2",
                email: "new@example.com",
                name: "New User",
            },
        });
    });

    it("loginUser returns 400 when passport returns no user", () => {
        passportAuthenticateMock.mockImplementation(
            (_strategy: string, _opts: object, cb: (err: Error | null, user: unknown, info: { message: string }) => void) =>
                (_req: Request, _res: Response, _next: NextFunction) => {
                    cb(null, false, { message: "Invalid credentials" });
                },
        );

        const req = createReqMock({ body: { email: "a@b.com", password: "pw" } });
        const res = createResMock();
        const next = jest.fn() as NextFunction;

        loginUser(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "Invalid credentials" });
    });

    it("loginUser returns token and public user when authentication succeeds", () => {
        passportAuthenticateMock.mockImplementation(
            (_strategy: string, _opts: object, cb: (err: Error | null, user: unknown, info: { message: string }) => void) =>
                (_req: Request, _res: Response, _next: NextFunction) => {
                    cb(null, { id: "user_1", email: "a@b.com", name: "Alice" }, { message: "" });
                },
        );
        jwtSignMock.mockReturnValue("jwt_token");

        const req = createReqMock({ body: { email: "a@b.com", password: "pw" } });
        const res = createResMock();
        const next = jest.fn() as NextFunction;

        loginUser(req, res, next);

        expect(jwtSignMock).toHaveBeenCalledWith(
            { userId: "user_1" },
            process.env.JWT_SECRET,
            { expiresIn: "1h" },
        );
        expect(res.json).toHaveBeenCalledWith({
            user: {
                id: "user_1",
                email: "a@b.com",
                name: "Alice",
            },
            token: "jwt_token",
        });
    });

    it("deleteAccount returns 401 when no authenticated user exists", async () => {
        const req = createReqMock({ body: { password: "pw" } });
        const res = createResMock();

        await deleteAccount(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    });

    it("deleteAccount returns 403 when password does not match", async () => {
        prismaMock.user.findUnique.mockResolvedValue({
            id: "user_1",
            password: "stored_hash",
        });
        bcryptCompareMock.mockResolvedValue(false);

        const req = createReqMock({
            user: { id: "user_1" },
            body: { password: "wrong_pw" },
        });
        const res = createResMock();

        await deleteAccount(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ error: "Incorrect password" });
    });

    it("deleteAccount deletes dependent data in a transaction", async () => {
        prismaMock.user.findUnique.mockResolvedValue({
            id: "user_1",
            password: "stored_hash",
        });
        bcryptCompareMock.mockResolvedValue(true);

        const tx = {
            practiceSession: {
                findMany: jest.fn(async () => [{ id: "session_1" }]),
                deleteMany: jest.fn(async () => ({ count: 1 })),
            },
            scoreCard: {
                deleteMany: jest.fn(async () => ({ count: 2 })),
            },
            user: {
                delete: jest.fn(async () => ({ id: "user_1" })),
            },
        };

        prismaMock.$transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<void>) => fn(tx));

        const req = createReqMock({
            user: { id: "user_1" },
            body: { password: "correct_pw" },
        });
        const res = createResMock();

        await deleteAccount(req, res);

        expect(tx.practiceSession.findMany).toHaveBeenCalledWith({
            where: { userId: "user_1" },
            select: { id: true },
        });
        expect(tx.scoreCard.deleteMany).toHaveBeenCalledWith({
            where: { sessionId: { in: ["session_1"] } },
        });
        expect(tx.practiceSession.deleteMany).toHaveBeenCalledWith({
            where: { userId: "user_1" },
        });
        expect(tx.user.delete).toHaveBeenCalledWith({
            where: { id: "user_1" },
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            ok: true,
            message: "Account deleted",
        });
    });
});
