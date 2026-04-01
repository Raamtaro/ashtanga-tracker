import { Request, Response } from "express";
import type { Status } from "@prisma/client";
import { z } from "zod";
import { METRIC_KEYS, type MetricKey } from "../../../lib/constants.js";
import type { SessionViewerCard, SessionViewerSummary } from "../../../types/session.js";
import { sendMissingSessionId, sendUnauthorized } from "./basic.errors.js";

export const REQUIRED_METRICS = METRIC_KEYS;

export const qSchema = z.object({
    limit: z.coerce.number().int().positive().max(100).default(20),
    cursor: z.string().optional(), // base64url token
});

export const updateSessionBodySchema = z.object({
    label: z.string().trim().min(1).max(255).nullable().optional(),
    durationMinutes: z.union([z.coerce.number().int().min(1), z.null()]).optional(),
    overallScore: z.union([z.coerce.number().min(1).max(10), z.null()]).optional(),
    energyLevel: z.union([z.coerce.number().int().min(1).max(10), z.null()]).optional(),
    mood: z.union([z.coerce.number().int().min(1).max(10), z.null()]).optional(),
    notes: z.string().max(2000).nullable().optional(),
}).refine((obj) => Object.keys(obj).length > 0, { message: "No fields to update" });

export type CursorPayload = { d: string; id: string }; // d = ISO date string of last item

export function encodeCursor(p: CursorPayload) {
    return Buffer.from(JSON.stringify(p)).toString("base64url");
}

export function decodeCursor(s: string | undefined): CursorPayload | undefined {
    if (!s) return undefined;
    try {
        return JSON.parse(Buffer.from(s, "base64url").toString("utf8")) as CursorPayload;
    } catch {
        return undefined;
    }
}

export function requireUserId(req: Request, res: Response): string | null {
    const client = req.user as { id: string } | undefined;
    if (!client?.id) {
        sendUnauthorized(res);
        return null;
    }
    return client.id;
}

export function requireSessionIdParam(req: Request, res: Response): string | null {
    const { id } = req.params;
    if (!id) {
        sendMissingSessionId(res);
        return null;
    }
    return id;
}

export function computeCardOverall(sc: Record<(typeof REQUIRED_METRICS)[number], number | null>) {
    const nums = REQUIRED_METRICS
        .map((k) => sc[k])
        .filter((v): v is number => typeof v === "number");
    if (!nums.length) return null;
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    return Math.round(avg * 100) / 100; // 2 decimals
}

type SessionViewerSourceCard = {
    id: string;
    orderInSession: number;
    segment: SessionViewerCard["segment"];
    side: SessionViewerCard["side"];
    scored: boolean;
    skipped: boolean;
    overallScore: number | null;
    ease: number | null;
    comfort: number | null;
    stability: number | null;
    pain: number | null;
    breath: number | null;
    focus: number | null;
    pose: SessionViewerCard["pose"];
};

function isSessionViewerCardComplete(
    card: Pick<SessionViewerSourceCard, "scored" | "skipped"> & Partial<Record<MetricKey, number | null>>,
): boolean {
    const requiresMetrics = card.scored && !card.skipped;
    const missingAny = requiresMetrics && REQUIRED_METRICS.some((k) => card[k] == null);
    return !missingAny;
}

export function toSessionViewerCards(
    scoreCards: SessionViewerSourceCard[],
    sessionStatus: Status,
): SessionViewerCard[] {
    return scoreCards.map((card) => {
        const isComplete = isSessionViewerCardComplete(card);
        return {
            id: card.id,
            orderInSession: card.orderInSession,
            segment: card.segment,
            side: card.side,
            scored: card.scored,
            skipped: card.skipped,
            overallScore: card.overallScore,
            isComplete,
            canToggleSkipped: !card.scored && sessionStatus === "DRAFT",
            canEditScore: card.scored && sessionStatus === "DRAFT",
            pose: card.pose,
        };
    });
}

export function buildSessionViewerSummary(practicedCards: SessionViewerCard[]): SessionViewerSummary {
    const scoredCards = practicedCards.filter((card) => card.scored);
    const firstIncomplete = scoredCards.find((card) => !card.isComplete)?.id ?? null;
    const completeScoredCount = scoredCards.filter((card) => card.isComplete).length;
    const incompleteScoredCount = scoredCards.length - completeScoredCount;
    const completeLegacyCount = practicedCards.filter((card) => card.isComplete).length;
    const incompleteLegacyCount = practicedCards.length - completeLegacyCount;

    return {
        total: practicedCards.length, // legacy key for existing clients
        complete: completeLegacyCount, // legacy key for existing clients
        incomplete: incompleteLegacyCount, // legacy key for existing clients
        totalScoreCards: practicedCards.length,
        scoredScoreCards: scoredCards.length,
        unscoredScoreCards: practicedCards.length - scoredCards.length,
        activeScoreCards: scoredCards.filter((card) => !card.skipped).length,
        skippedScoreCards: scoredCards.filter((card) => card.skipped).length,
        completeScoreCards: completeScoredCount,
        incompleteScoreCards: incompleteScoredCount,
        firstIncompleteScoreCardId: firstIncomplete,
    };
}
