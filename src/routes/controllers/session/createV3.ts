import { createHash } from "node:crypto";

import { PracticeType, Prisma, SequenceGroup, SequenceSegment } from "@prisma/client";
import { Request, Response } from "express";
import { z } from "zod";

import prisma from "../../../lib/prisma.js";
import {
    CATALOG,
    advancedAOnly,
    advancedBOnly,
    intermediateOnly,
    primaryOnly,
    type GroupKey,
} from "../../../lib/sequenceDef.js";

const slugify = (name: string) =>
    name.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

type PlanItem = {
    name: string;
    slug: string;
    segment: SequenceSegment;
};

type SessionV3DbClient = Prisma.TransactionClient | typeof prisma;

type CandidatePose = {
    id: string;
    slug: string;
    sanskritName: string;
    englishName: string | null;
    sequenceGroup: SequenceGroup;
    isTwoSided: boolean;
};

type ResolvedCandidateCard = {
    orderInSession: number;
    poseId: string;
    slug: string;
    sanskritName: string;
    englishName: string | null;
    sequenceGroup: SequenceGroup;
    segment: SequenceSegment;
    side: "RIGHT" | "LEFT" | "NA";
    isTwoSided: boolean;
};

type CandidateCardResponse = Omit<ResolvedCandidateCard, "poseId" | "isTwoSided">;

type CandidatePoseOption = {
    slug: string;
    sanskritName: string;
    englishName: string | null;
    sequenceGroup: SequenceGroup;
    isTwoSided: boolean;
    firstOrderInSession: number;
};

type ResolvedCandidates = {
    practiceType: PracticeType;
    candidateCards: ResolvedCandidateCard[];
    candidateHash: string;
    poseOptions: CandidatePoseOption[];
    validSlugs: string[];
};

const SEGMENT_FOR_GROUP: Record<GroupKey, SequenceSegment> = {
    SUN: "SUN_A",
    STANDING: "STANDING",
    PRIMARY_ONLY: "PRIMARY",
    INTERMEDIATE_ONLY: "INTERMEDIATE",
    ADVANCED_A_ONLY: "ADVANCED_A",
    ADVANCED_B_ONLY: "ADVANCED_B",
    BACKBENDING: "BACKBENDING",
    FINISHING: "FINISHING",
};

const presetPracticeTypes = [
    PracticeType.HALF_PRIMARY,
    PracticeType.FULL_PRIMARY,
    PracticeType.INTERMEDIATE,
    PracticeType.ADVANCED_A,
    PracticeType.ADVANCED_B,
] as const;

const presetPracticeTypeSchema = z.enum(presetPracticeTypes);
const sequenceSnippetSchema = z.object({
    group: z.enum(["PRIMARY", "INTERMEDIATE", "ADVANCED_A", "ADVANCED_B"]),
    upToSlug: z.string(),
});

const presetBodySchema = z.object({
    date: z.coerce.date().optional(),
    label: z.string().optional(),
    duration: z.number().min(1).optional(),
    overallScore: z.number().min(1).max(10).optional(),
    energyLevel: z.number().min(1).max(10).optional(),
    mood: z.number().min(1).max(10).optional(),
    notes: z.string().optional(),
    practiceType: presetPracticeTypeSchema,
    scoredPoses: z.array(z.string()).optional(),
    candidateHash: z.string().min(1).optional(),
});

const customBodySchema = z.object({
    date: z.coerce.date().optional(),
    label: z.string().optional(),
    duration: z.number().min(1).optional(),
    overallScore: z.number().min(1).max(10).optional(),
    energyLevel: z.number().min(1).max(10).optional(),
    mood: z.number().min(1).max(10).optional(),
    notes: z.string().optional(),
    practiceType: z.literal(PracticeType.CUSTOM),
    sequenceSnippets: z.array(sequenceSnippetSchema),
    scoredPoses: z.array(z.string()).optional(),
    candidateHash: z.string().min(1).optional(),
});

const candidatesBodySchema = z.discriminatedUnion("mode", [
    z.object({
        mode: z.literal("preset"),
        practiceType: presetPracticeTypeSchema,
    }),
    z.object({
        mode: z.literal("custom"),
        practiceType: z.literal(PracticeType.CUSTOM),
        sequenceSnippets: z.array(sequenceSnippetSchema),
    }),
]);

type PresetPracticeType = z.infer<typeof presetPracticeTypeSchema>;
type SequenceSnippet = z.infer<typeof sequenceSnippetSchema>;
type CandidatesBody = z.infer<typeof candidatesBodySchema>;

function formatValidationIssues(error: z.ZodError) {
    return error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
    }));
}

function sunSegmentForPoseName(name: string): SequenceSegment {
    if (/surya\s+namaskar\s+a/i.test(name)) return "SUN_A";
    if (/surya\s+namaskar\s+b/i.test(name)) return "SUN_B";
    return "SUN_A";
}

function toPlanItems(groupKey: GroupKey, names: string[]): PlanItem[] {
    const baseSegment = SEGMENT_FOR_GROUP[groupKey];
    return names.map((name) => ({
        name,
        slug: slugify(name),
        segment: groupKey === "SUN" ? sunSegmentForPoseName(name) : baseSegment,
    }));
}

function namesFromGroupKey(key: GroupKey): string[] {
    return CATALOG[key].map((pose) => pose.name);
}

function sliceBySlug(names: string[], upToSlug?: string): string[] {
    const indexed = names.map((name) => ({ name, slug: slugify(name) }));
    if (!upToSlug) return names;

    const cutoff = slugify(upToSlug);
    const toIdx = indexed.findIndex((row) => row.slug === cutoff);
    if (toIdx === -1) throw new Error(`upToSlug not found: ${upToSlug}`);

    return indexed.slice(0, toIdx + 1).map((row) => row.name);
}

function populatePresetPlan(practiceType: PresetPracticeType): PlanItem[] {
    const plan: PlanItem[] = [];

    plan.push(...toPlanItems("SUN", namesFromGroupKey("SUN")));
    plan.push(...toPlanItems("STANDING", namesFromGroupKey("STANDING")));

    switch (practiceType) {
        case PracticeType.HALF_PRIMARY: {
            const names = sliceBySlug(primaryOnly.map((pose) => pose.name), "navasana");
            plan.push(...toPlanItems("PRIMARY_ONLY", names));
            break;
        }
        case PracticeType.FULL_PRIMARY: {
            plan.push(...toPlanItems("PRIMARY_ONLY", namesFromGroupKey("PRIMARY_ONLY")));
            break;
        }
        case PracticeType.INTERMEDIATE: {
            plan.push(...toPlanItems("INTERMEDIATE_ONLY", namesFromGroupKey("INTERMEDIATE_ONLY")));
            break;
        }
        case PracticeType.ADVANCED_A: {
            plan.push(...toPlanItems("ADVANCED_A_ONLY", namesFromGroupKey("ADVANCED_A_ONLY")));
            break;
        }
        case PracticeType.ADVANCED_B: {
            plan.push(...toPlanItems("ADVANCED_B_ONLY", namesFromGroupKey("ADVANCED_B_ONLY")));
            break;
        }
    }

    plan.push(...toPlanItems("BACKBENDING", namesFromGroupKey("BACKBENDING")));
    plan.push(...toPlanItems("FINISHING", namesFromGroupKey("FINISHING")));

    return plan;
}

function populateCustomPlan(sequenceSnippets: SequenceSnippet[]): PlanItem[] {
    const midSequence: PlanItem[] = [];

    for (const snippet of sequenceSnippets) {
        switch (snippet.group) {
            case "PRIMARY": {
                const names = sliceBySlug(primaryOnly.map((pose) => pose.name), snippet.upToSlug);
                midSequence.push(...toPlanItems("PRIMARY_ONLY", names));
                break;
            }
            case "INTERMEDIATE": {
                const names = sliceBySlug(intermediateOnly.map((pose) => pose.name), snippet.upToSlug);
                midSequence.push(...toPlanItems("INTERMEDIATE_ONLY", names));
                break;
            }
            case "ADVANCED_A": {
                const names = sliceBySlug(advancedAOnly.map((pose) => pose.name), snippet.upToSlug);
                midSequence.push(...toPlanItems("ADVANCED_A_ONLY", names));
                break;
            }
            case "ADVANCED_B": {
                const names = sliceBySlug(advancedBOnly.map((pose) => pose.name), snippet.upToSlug);
                midSequence.push(...toPlanItems("ADVANCED_B_ONLY", names));
                break;
            }
            default: {
                throw new Error(`Invalid group key: ${snippet.group}`);
            }
        }
    }

    return [
        ...toPlanItems("SUN", namesFromGroupKey("SUN")),
        ...toPlanItems("STANDING", namesFromGroupKey("STANDING")),
        ...midSequence,
        ...toPlanItems("BACKBENDING", namesFromGroupKey("BACKBENDING")),
        ...toPlanItems("FINISHING", namesFromGroupKey("FINISHING")),
    ];
}

async function fetchPosesBySlug(
    db: SessionV3DbClient,
    slugs: string[],
): Promise<Map<string, CandidatePose>> {
    const rows = await db.pose.findMany({
        where: { slug: { in: slugs } },
        select: {
            id: true,
            slug: true,
            sanskritName: true,
            englishName: true,
            sequenceGroup: true,
            isTwoSided: true,
        },
    });

    const map = new Map(rows.map((row) => [row.slug, row]));
    const missing = slugs.filter((slug) => !map.has(slug));
    if (missing.length > 0) {
        throw new Error(`Missing Pose(s) in DB for slugs: ${missing.join(", ")}`);
    }

    return map;
}

function buildCandidateCards(
    items: PlanItem[],
    poseMap: Map<string, CandidatePose>,
): ResolvedCandidateCard[] {
    let order = 1;
    const cards: ResolvedCandidateCard[] = [];

    for (const item of items) {
        const pose = poseMap.get(item.slug)!;
        if (pose.isTwoSided) {
            cards.push(
                {
                    orderInSession: order++,
                    poseId: pose.id,
                    slug: pose.slug,
                    sanskritName: pose.sanskritName,
                    englishName: pose.englishName,
                    sequenceGroup: pose.sequenceGroup,
                    segment: item.segment,
                    side: "RIGHT",
                    isTwoSided: true,
                },
                {
                    orderInSession: order++,
                    poseId: pose.id,
                    slug: pose.slug,
                    sanskritName: pose.sanskritName,
                    englishName: pose.englishName,
                    sequenceGroup: pose.sequenceGroup,
                    segment: item.segment,
                    side: "LEFT",
                    isTwoSided: true,
                },
            );
        } else {
            cards.push({
                orderInSession: order++,
                poseId: pose.id,
                slug: pose.slug,
                sanskritName: pose.sanskritName,
                englishName: pose.englishName,
                sequenceGroup: pose.sequenceGroup,
                segment: item.segment,
                side: "NA",
                isTwoSided: false,
            });
        }
    }

    return cards;
}

function buildPoseOptions(candidateCards: ResolvedCandidateCard[]): CandidatePoseOption[] {
    const seen = new Set<string>();
    const options: CandidatePoseOption[] = [];

    for (const card of candidateCards) {
        if (seen.has(card.slug)) continue;
        seen.add(card.slug);

        options.push({
            slug: card.slug,
            sanskritName: card.sanskritName,
            englishName: card.englishName,
            sequenceGroup: card.sequenceGroup,
            isTwoSided: card.isTwoSided,
            firstOrderInSession: card.orderInSession,
        });
    }

    return options;
}

function buildCandidateHash(practiceType: PracticeType, candidateCards: ResolvedCandidateCard[]) {
    const fingerprint = candidateCards
        .map((card) => `${card.orderInSession}:${card.poseId}:${card.segment}:${card.side}`)
        .join("|");

    return createHash("sha256")
        .update(`${practiceType}::${fingerprint}`)
        .digest("hex");
}

async function resolveCandidates(
    db: SessionV3DbClient,
    input: CandidatesBody,
): Promise<ResolvedCandidates> {
    const practiceType = input.practiceType;
    const items = input.mode === "preset"
        ? populatePresetPlan(input.practiceType)
        : populateCustomPlan(input.sequenceSnippets);

    const uniqueSlugs = Array.from(new Set(items.map((item) => item.slug)));
    const poseMap = await fetchPosesBySlug(db, uniqueSlugs);
    const candidateCards = buildCandidateCards(items, poseMap);
    const poseOptions = buildPoseOptions(candidateCards);
    const candidateHash = buildCandidateHash(practiceType, candidateCards);

    return {
        practiceType,
        candidateCards,
        candidateHash,
        poseOptions,
        validSlugs: poseOptions.map((pose) => pose.slug),
    };
}

function normalizeScoredPoses(scoredPoses: string[] | undefined) {
    if (scoredPoses === undefined) return undefined;
    return Array.from(new Set(scoredPoses.map((slug) => slug.trim()).filter(Boolean)));
}

function validateScoredPosesSubset(scoredPoses: string[] | undefined, validSlugs: string[]) {
    const normalizedScoredPoses = normalizeScoredPoses(scoredPoses);
    if (normalizedScoredPoses === undefined) {
        return { normalizedScoredPoses: undefined, invalidSlugs: [] as string[] };
    }

    const validSlugSet = new Set(validSlugs);
    const invalidSlugs = normalizedScoredPoses.filter((slug) => !validSlugSet.has(slug));

    return { normalizedScoredPoses, invalidSlugs };
}

function toCandidateCardResponse(card: ResolvedCandidateCard): CandidateCardResponse {
    const { poseId: _poseId, isTwoSided: _isTwoSided, ...responseCard } = card;
    return responseCard;
}

function parseCandidateResolutionError(error: unknown) {
    if (error instanceof Error && error.message.startsWith("upToSlug not found:")) {
        return {
            status: 422,
            payload: {
                message: "Invalid sequenceSnippets input",
                detail: error.message,
            },
        };
    }

    return null;
}

async function buildSessionWithScoreCards(
    params: {
        tx: Prisma.TransactionClient;
        userId: string;
        date?: Date;
        label?: string;
        overallScore?: number;
        energyLevel?: number;
        mood?: number;
        notes?: string;
        duration?: number;
        practiceType: PracticeType;
        candidateCards: ResolvedCandidateCard[];
        scoredPoses: string[] | undefined;
    },
) {
    const {
        tx,
        userId,
        date,
        label,
        overallScore,
        energyLevel,
        mood,
        notes,
        duration,
        practiceType,
        candidateCards,
        scoredPoses,
    } = params;

    const session = await tx.practiceSession.create({
        data: {
            userId,
            date: date ?? new Date(),
            label: label ?? `${practiceType} Practice - ${new Date().toLocaleDateString()}`,
            overallScore: overallScore ?? null,
            energyLevel: energyLevel ?? null,
            mood: mood ?? null,
            notes: notes ?? null,
            practiceType,
            durationMinutes: duration ?? null,
            status: "DRAFT",
        },
    });

    const scoredPoseSet = scoredPoses ? new Set(scoredPoses) : undefined;

    const data: Prisma.ScoreCardCreateManyInput[] = candidateCards.map((card) => ({
        sessionId: session.id,
        poseId: card.poseId,
        orderInSession: card.orderInSession,
        segment: card.segment,
        side: card.side,
        skipped: false,
        scored: scoredPoseSet ? scoredPoseSet.has(card.slug) : false,
    }));

    await tx.scoreCard.createMany({ data });

    return tx.practiceSession.findUnique({
        where: { id: session.id },
        select: {
            id: true,
            date: true,
            label: true,
            overallScore: true,
            energyLevel: true,
            mood: true,
            notes: true,
            practiceType: true,
            durationMinutes: true,
            scoreCards: {
                orderBy: { orderInSession: "asc" },
                select: {
                    id: true,
                    side: true,
                    pose: {
                        select: {
                            slug: true,
                            sequenceGroup: true,
                        },
                    },
                    scored: true,
                },
            },
        },
    });
}

export const getSessionV3Candidates = async (req: Request, res: Response) => {
    const client = req.user as { id: string } | undefined;
    if (!client?.id) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const parsed = candidatesBodySchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(422).json({
            message: "Invalid input",
            issues: formatValidationIssues(parsed.error),
        });
    }

    let resolved: ResolvedCandidates;
    try {
        resolved = await resolveCandidates(prisma, parsed.data);
    } catch (error) {
        const handled = parseCandidateResolutionError(error);
        if (handled) return res.status(handled.status).json(handled.payload);
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
    const client = req.user as { id: string } | undefined;
    if (!client?.id) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const parsed = presetBodySchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(422).json({
            message: "Invalid input",
            issues: formatValidationIssues(parsed.error),
        });
    }

    const body = parsed.data;

    let resolved: ResolvedCandidates;
    try {
        resolved = await resolveCandidates(prisma, {
            mode: "preset",
            practiceType: body.practiceType,
        });
    } catch (error) {
        const handled = parseCandidateResolutionError(error);
        if (handled) return res.status(handled.status).json(handled.payload);
        throw error;
    }

    if (body.candidateHash && body.candidateHash !== resolved.candidateHash) {
        return res.status(409).json({
            message: "Candidate pose list is stale. Refresh candidates and retry.",
            candidateHash: resolved.candidateHash,
        });
    }

    const { normalizedScoredPoses, invalidSlugs } = validateScoredPosesSubset(
        body.scoredPoses,
        resolved.validSlugs,
    );

    if (invalidSlugs.length > 0) {
        return res.status(400).json({
            message: "scoredPoses must be a subset of candidate pose slugs",
            invalidSlugs,
            validSlugs: resolved.validSlugs,
        });
    }

    const session = await prisma.$transaction(async (tx) => (
        buildSessionWithScoreCards({
            tx,
            userId: client.id,
            date: body.date,
            label: body.label,
            overallScore: body.overallScore,
            energyLevel: body.energyLevel,
            mood: body.mood,
            notes: body.notes,
            practiceType: body.practiceType,
            duration: body.duration,
            candidateCards: resolved.candidateCards,
            scoredPoses: normalizedScoredPoses,
        })
    ));

    return res.status(201).json({ session });
};

export const createCustomSession = async (req: Request, res: Response) => {
    const client = req.user as { id: string } | undefined;
    if (!client?.id) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const parsed = customBodySchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(422).json({
            message: "Invalid input",
            issues: formatValidationIssues(parsed.error),
        });
    }

    const body = parsed.data;

    let resolved: ResolvedCandidates;
    try {
        resolved = await resolveCandidates(prisma, {
            mode: "custom",
            practiceType: body.practiceType,
            sequenceSnippets: body.sequenceSnippets,
        });
    } catch (error) {
        const handled = parseCandidateResolutionError(error);
        if (handled) return res.status(handled.status).json(handled.payload);
        throw error;
    }

    if (body.candidateHash && body.candidateHash !== resolved.candidateHash) {
        return res.status(409).json({
            message: "Candidate pose list is stale. Refresh candidates and retry.",
            candidateHash: resolved.candidateHash,
        });
    }

    const { normalizedScoredPoses, invalidSlugs } = validateScoredPosesSubset(
        body.scoredPoses,
        resolved.validSlugs,
    );

    if (invalidSlugs.length > 0) {
        return res.status(400).json({
            message: "scoredPoses must be a subset of candidate pose slugs",
            invalidSlugs,
            validSlugs: resolved.validSlugs,
        });
    }

    const session = await prisma.$transaction(async (tx) => (
        buildSessionWithScoreCards({
            tx,
            userId: client.id,
            date: body.date,
            label: body.label,
            overallScore: body.overallScore,
            energyLevel: body.energyLevel,
            mood: body.mood,
            notes: body.notes,
            practiceType: body.practiceType,
            duration: body.duration,
            candidateCards: resolved.candidateCards,
            scoredPoses: normalizedScoredPoses,
        })
    ));

    return res.status(201).json({ session });
};
