import { Prisma, type Status } from "@prisma/client";
import {
    REQUIRED_METRICS,
    computeCardOverall,
} from "./basic.helpers.js";
import {
    SESSION_ID_STATUS_SELECT,
    SESSION_PUBLISH_RESULT_SELECT,
} from "./basic.selects.js";

type PublishWorkflowSession = {
    id: string;
    status: Status;
    date: Date;
    overallScore: number | null;
};

type PublishWorkflowIncompleteError = {
    message: string;
    scoreCardId: string;
    pose: {
        sanskritName: string;
        slug: string;
    };
    side: "LEFT" | "RIGHT" | "BOTH" | "NA" | null;
    missing: readonly (typeof REQUIRED_METRICS)[number][];
};

export type PublishWorkflowResult =
    | { kind: "not_found" }
    | { kind: "incomplete"; error: PublishWorkflowIncompleteError }
    | { kind: "ok"; session: PublishWorkflowSession };

export async function runPublishWorkflow(
    tx: Prisma.TransactionClient,
    params: { sessionId: string; userId: string },
): Promise<PublishWorkflowResult> {
    const { sessionId, userId } = params;

    const session = await tx.practiceSession.findFirst({
        where: { id: sessionId, userId },
        select: SESSION_ID_STATUS_SELECT,
    });

    if (!session) {
        return { kind: "not_found" };
    }

    // If currently published -> unpublish (no validation)
    if (session.status === "PUBLISHED") {
        const updated = await tx.practiceSession.update({
            where: { id: session.id },
            data: { status: "DRAFT" },
            select: SESSION_PUBLISH_RESULT_SELECT,
        });
        return { kind: "ok", session: updated };
    }

    // Otherwise, publishing from DRAFT -> PUBLISHED
    // 1) Validate completeness: any required metric null on any scored + unskipped card?
    const incomplete = await tx.scoreCard.findFirst({
        where: {
            sessionId: session.id,
            scored: true,
            skipped: false,
            OR: REQUIRED_METRICS.map((k) => ({ [k]: null })),
        },
        select: {
            id: true,
            side: true,
            pose: { select: { sanskritName: true, slug: true } },
            ease: true,
            comfort: true,
            stability: true,
            pain: true,
            breath: true,
            focus: true,
        },
    });

    if (incomplete) {
        const missing = REQUIRED_METRICS.filter((k) => incomplete[k] == null);
        return {
            kind: "incomplete",
            error: {
                message: "Cannot publish: some scored scorecards are incomplete.",
                scoreCardId: incomplete.id,
                pose: incomplete.pose,
                side: incomplete.side,
                missing,
            },
        };
    }

    // 2) Recompute overallScore for all scored + unskipped cards (safe + idempotent)
    const cards = await tx.scoreCard.findMany({
        where: { sessionId: session.id, scored: true, skipped: false },
        select: {
            id: true,
            ease: true,
            comfort: true,
            stability: true,
            pain: true,
            breath: true,
            focus: true,
        },
    });

    for (const card of cards) {
        const overallScore = computeCardOverall(card);
        await tx.scoreCard.update({
            where: { id: card.id },
            data: { overallScore },
            select: { id: true },
        });
    }

    // 3) Compute + store session overallScore
    const agg = await tx.scoreCard.aggregate({
        where: { sessionId: session.id, scored: true, skipped: false, overallScore: { not: null } },
        _avg: { overallScore: true },
    });

    const updated = await tx.practiceSession.update({
        where: { id: session.id },
        data: {
            status: "PUBLISHED",
            overallScore: agg._avg.overallScore ?? null,
        },
        select: SESSION_PUBLISH_RESULT_SELECT,
    });

    return { kind: "ok", session: updated };
}
