import type { Prisma } from "@prisma/client";
import { runPublishWorkflow } from "./publishSession.service.js";

type AsyncMock<Args extends unknown[], Result> = ((...args: Args) => Promise<Result>) & {
    calls: Args[];
};

type AnyAsyncMock = {
    (...args: any[]): Promise<any>;
    calls: unknown[][];
};

function createAsyncMock<Args extends unknown[], Result>(
    impl: (...args: Args) => Promise<Result> | Result,
): AsyncMock<Args, Result> {
    const calls: Args[] = [];
    const fn = (async (...args: Args) => {
        calls.push(args);
        return await impl(...args);
    }) as AsyncMock<Args, Result>;
    fn.calls = calls;
    return fn;
}

function createTxMock(params: {
    practiceSessionFindFirst: AnyAsyncMock;
    practiceSessionUpdate: AnyAsyncMock;
    scoreCardFindFirst: AnyAsyncMock;
    scoreCardFindMany: AnyAsyncMock;
    scoreCardUpdate: AnyAsyncMock;
    scoreCardAggregate: AnyAsyncMock;
}) {
    return {
        practiceSession: {
            findFirst: params.practiceSessionFindFirst,
            update: params.practiceSessionUpdate,
        },
        scoreCard: {
            findFirst: params.scoreCardFindFirst,
            findMany: params.scoreCardFindMany,
            update: params.scoreCardUpdate,
            aggregate: params.scoreCardAggregate,
        },
    } as unknown as Prisma.TransactionClient;
}

describe("publishSession.service", () => {
    it("returns not_found when session does not exist", async () => {
        const practiceSessionFindFirst = createAsyncMock(async () => null);
        const tx = createTxMock({
            practiceSessionFindFirst,
            practiceSessionUpdate: createAsyncMock(async () => {
                throw new Error("should not be called");
            }),
            scoreCardFindFirst: createAsyncMock(async () => {
                throw new Error("should not be called");
            }),
            scoreCardFindMany: createAsyncMock(async () => {
                throw new Error("should not be called");
            }),
            scoreCardUpdate: createAsyncMock(async () => {
                throw new Error("should not be called");
            }),
            scoreCardAggregate: createAsyncMock(async () => {
                throw new Error("should not be called");
            }),
        });

        const result = await runPublishWorkflow(tx, { sessionId: "session_1", userId: "user_1" });

        expect(result.kind).toBe("not_found");
        expect(practiceSessionFindFirst.calls.length).toBe(1);
    });

    it("unpublishes when session is already published", async () => {
        const practiceSessionFindFirst = createAsyncMock(async () => ({ id: "session_1", status: "PUBLISHED" as const }));
        const practiceSessionUpdate = createAsyncMock(async () => ({
            id: "session_1",
            status: "DRAFT" as const,
            date: new Date("2026-04-01T00:00:00.000Z"),
            overallScore: 7.2,
        }));
        const scoreCardFindFirst = createAsyncMock(async () => {
            throw new Error("should not be called");
        });
        const tx = createTxMock({
            practiceSessionFindFirst,
            practiceSessionUpdate,
            scoreCardFindFirst,
            scoreCardFindMany: createAsyncMock(async () => {
                throw new Error("should not be called");
            }),
            scoreCardUpdate: createAsyncMock(async () => {
                throw new Error("should not be called");
            }),
            scoreCardAggregate: createAsyncMock(async () => {
                throw new Error("should not be called");
            }),
        });

        const result = await runPublishWorkflow(tx, { sessionId: "session_1", userId: "user_1" });

        expect(result.kind).toBe("ok");
        if (result.kind === "ok") {
            expect(result.session.status).toBe("DRAFT");
            expect(result.session.id).toBe("session_1");
        }
        expect(practiceSessionUpdate.calls.length).toBe(1);
        expect(scoreCardFindFirst.calls.length).toBe(0);
    });

    it("returns incomplete when scored unskipped card is missing required metrics", async () => {
        const practiceSessionFindFirst = createAsyncMock(async () => ({ id: "session_2", status: "DRAFT" as const }));
        const scoreCardFindFirst = createAsyncMock(async () => ({
            id: "card_1",
            side: "LEFT" as const,
            pose: { sanskritName: "Trikonasana", slug: "trikonasana" },
            ease: 8,
            comfort: null,
            stability: 7,
            pain: 6,
            breath: 8,
            focus: 7,
        }));
        const tx = createTxMock({
            practiceSessionFindFirst,
            practiceSessionUpdate: createAsyncMock(async () => {
                throw new Error("should not be called");
            }),
            scoreCardFindFirst,
            scoreCardFindMany: createAsyncMock(async () => {
                throw new Error("should not be called");
            }),
            scoreCardUpdate: createAsyncMock(async () => {
                throw new Error("should not be called");
            }),
            scoreCardAggregate: createAsyncMock(async () => {
                throw new Error("should not be called");
            }),
        });

        const result = await runPublishWorkflow(tx, { sessionId: "session_2", userId: "user_1" });

        expect(result.kind).toBe("incomplete");
        if (result.kind === "incomplete") {
            expect(result.error.scoreCardId).toBe("card_1");
            expect(result.error.missing).toEqual(["comfort"]);
        }
    });

    it("publishes and recomputes overall scores for all scored + unskipped cards", async () => {
        const practiceSessionFindFirst = createAsyncMock(async () => ({ id: "session_3", status: "DRAFT" as const }));
        const scoreCardFindFirst = createAsyncMock(async () => null);
        const scoreCardFindMany = createAsyncMock(async () => ([
            { id: "card_1", ease: 8, comfort: 8, stability: 7, pain: 7, breath: 8, focus: 8 },
            { id: "card_2", ease: 9, comfort: 9, stability: 8, pain: 8, breath: 9, focus: 9 },
        ]));
        const scoreCardUpdate = createAsyncMock(async () => ({ id: "noop" }));
        const scoreCardAggregate = createAsyncMock(async () => ({ _avg: { overallScore: 8.25 } }));
        const practiceSessionUpdate = createAsyncMock(async () => ({
            id: "session_3",
            status: "PUBLISHED" as const,
            date: new Date("2026-04-01T00:00:00.000Z"),
            overallScore: 8.25,
        }));
        const tx = createTxMock({
            practiceSessionFindFirst,
            practiceSessionUpdate,
            scoreCardFindFirst,
            scoreCardFindMany,
            scoreCardUpdate,
            scoreCardAggregate,
        });

        const result = await runPublishWorkflow(tx, { sessionId: "session_3", userId: "user_1" });

        expect(result.kind).toBe("ok");
        if (result.kind === "ok") {
            expect(result.session.status).toBe("PUBLISHED");
            expect(result.session.overallScore).toBe(8.25);
        }
        expect(scoreCardUpdate.calls.length).toBe(2);
        expect(scoreCardAggregate.calls.length).toBe(1);
        expect(practiceSessionUpdate.calls.length).toBe(1);
    });
});
