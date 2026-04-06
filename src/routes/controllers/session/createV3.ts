import { PracticeType } from "@prisma/client";
import { Request, Response } from "express";

import prisma from "../../../lib/prisma.js";
import {
    candidatesBodySchema,
    customBodySchema,
    formatValidationIssues,
    presetBodySchema,
    type CandidatesBody,
    type CustomBody,
    type PresetBody,
} from "./createV3.schemas.js";
import {
    buildSessionWithScoreCards,
    parseCandidateResolutionError,
    resolveCandidates,
    toCandidateCardResponse,
    validateScoredPosesSubset,
} from "./createV3.service.js";

type CreateBody = PresetBody | CustomBody;

function getAuthorizedUserId(req: Request) {
    const client = req.user as { id: string } | undefined;
    return client?.id;
}

function handleCandidateResolutionError(res: Response, error: unknown) {
    const handled = parseCandidateResolutionError(error);
    if (!handled) return false;

    res.status(handled.status).json(handled.payload);
    return true;
}

function validateCandidateHash(res: Response, incomingHash: string | undefined, currentHash: string) {
    if (!incomingHash || incomingHash === currentHash) return false;

    res.status(409).json({
        message: "Candidate pose list is stale. Refresh candidates and retry.",
        candidateHash: currentHash,
    });
    return true;
}

function validateScoredPoses(
    res: Response,
    scoredPoses: string[] | undefined,
    validSlugs: string[],
) {
    const { normalizedScoredPoses, invalidSlugs } = validateScoredPosesSubset(scoredPoses, validSlugs);

    if (invalidSlugs.length > 0) {
        res.status(400).json({
            message: "scoredPoses must be a subset of candidate pose slugs",
            invalidSlugs,
            validSlugs,
        });
        return { hasError: true, normalizedScoredPoses: undefined };
    }

    return { hasError: false, normalizedScoredPoses };
}

async function createSessionFromBody(
    userId: string,
    res: Response,
    body: CreateBody,
    candidateInput: CandidatesBody,
) {
    let resolved;
    try {
        resolved = await resolveCandidates(prisma, candidateInput);
    } catch (error) {
        if (handleCandidateResolutionError(res, error)) return;
        throw error;
    }

    if (validateCandidateHash(res, body.candidateHash, resolved.candidateHash)) return;

    const scoredValidation = validateScoredPoses(res, body.scoredPoses, resolved.validSlugs);
    if (scoredValidation.hasError) return;

    const session = await prisma.$transaction((tx) => (
        buildSessionWithScoreCards({
            tx,
            userId,
            date: body.date,
            label: body.label,
            overallScore: body.overallScore,
            energyLevel: body.energyLevel,
            mood: body.mood,
            notes: body.notes,
            practiceType: body.practiceType,
            duration: body.duration,
            candidateCards: resolved.candidateCards,
            scoredPoses: scoredValidation.normalizedScoredPoses,
        })
    ));

    return res.status(201).json({ session });
}

export const getSessionV3Candidates = async (req: Request, res: Response) => {
    const userId = getAuthorizedUserId(req);
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const parsed = candidatesBodySchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(422).json({
            message: "Invalid input",
            issues: formatValidationIssues(parsed.error),
        });
    }

    let resolved;
    try {
        resolved = await resolveCandidates(prisma, parsed.data);
    } catch (error) {
        if (handleCandidateResolutionError(res, error)) return;
        throw error;
    }

    return res.status(200).json({
        practiceType: resolved.practiceType,
        candidateHash: resolved.candidateHash,
        candidateCards: resolved.candidateCards.map(toCandidateCardResponse),
        poseOptions: resolved.poseOptions,
    });
};

export const createPresetSession = async (req: Request, res: Response) => {
    const userId = getAuthorizedUserId(req);
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const parsed = presetBodySchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(422).json({
            message: "Invalid input",
            issues: formatValidationIssues(parsed.error),
        });
    }

    return createSessionFromBody(userId, res, parsed.data, {
        mode: "preset",
        practiceType: parsed.data.practiceType,
    });
};

export const createCustomSession = async (req: Request, res: Response) => {
    const userId = getAuthorizedUserId(req);
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const parsed = customBodySchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(422).json({
            message: "Invalid input",
            issues: formatValidationIssues(parsed.error),
        });
    }

    if (parsed.data.practiceType !== PracticeType.CUSTOM) {
        return res.status(400).json({ message: "Invalid practiceType for custom session" });
    }

    return createSessionFromBody(userId, res, parsed.data, {
        mode: "custom",
        practiceType: parsed.data.practiceType,
        sequenceSnippets: parsed.data.sequenceSnippets,
    });
};
