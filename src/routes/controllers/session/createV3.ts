import prisma from "../../../lib/prisma.js";
import { SequenceSegment, PracticeType, Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { z } from 'zod';

import { CATALOG, primaryOnly, intermediateOnly, advancedAOnly, advancedBOnly, type GroupKey } from '../../../lib/sequenceDef.js';



const slugify = (name: string) =>
    name.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

type PlanItem = {

    name: string;
    slug: string;

    segment: SequenceSegment;
};

const SEGMENT_FOR_GROUP: Record<GroupKey, SequenceSegment> = {
    SUN: 'SUN_A',             // will be fixed per pose name (A/B) below
    STANDING: 'STANDING',
    PRIMARY_ONLY: 'PRIMARY',
    INTERMEDIATE_ONLY: 'INTERMEDIATE',
    ADVANCED_A_ONLY: 'ADVANCED_A',
    ADVANCED_B_ONLY: 'ADVANCED_B',
    BACKBENDING: 'BACKBENDING',
    FINISHING: 'FINISHING',
};

function sunSegmentForPoseName(name: string): SequenceSegment {
    if (/surya\s+namaskar\s+a/i.test(name)) return 'SUN_A';
    if (/surya\s+namaskar\s+b/i.test(name)) return 'SUN_B';
    return 'SUN_A';
}

function toPlanItems(groupKey: GroupKey, names: string[]): PlanItem[] {
    const baseSegment = SEGMENT_FOR_GROUP[groupKey];
    return names.map((name) => ({
        name,
        slug: slugify(name),
        segment: groupKey === 'SUN' ? sunSegmentForPoseName(name) : baseSegment,
    }));
}

function sliceBySlug(names: string[], upToSlug?: string): string[] {
    const indexed = names.map((n) => ({ n, s: slugify(n) }));
    // const fromIdx = fromSlug ? indexed.findIndex((x) => x.s === slugify(fromSlug!)) : 0;
    if (!upToSlug) return names;
    const cutoff = slugify(upToSlug);
    const toIdx = indexed.findIndex((x) => x.s === cutoff);

    if (toIdx === -1) throw new Error(`upToSlug not found: ${upToSlug}`);

    return indexed.slice(0, toIdx + 1).map((x) => x.n);
}

async function fetchPosesBySlug(tx: Prisma.TransactionClient, slugs: string[]): Promise<Map<string, {
    id: string;
    slug: string;
    isTwoSided: boolean;
}>> {

    const rows = await tx.pose.findMany(
        {
            where: {
                slug: {
                    in: slugs
                }
            },
            select: {
                id: true,
                slug: true,
                isTwoSided: true
            }
        }
    )

    const map = new Map(rows.map(r => [r.slug, r]));
    const missing = slugs.filter(s => !map.has(s));
    if (missing.length) throw new Error(`Missing Pose(s) in DB for slugs: ${missing.join(', ')}`);
    return map;
}

function namesFromGroupKey(key: GroupKey): string[] {
    return CATALOG[key].map((p) => p.name);
}

/**
 * Zod Schemas
 * 
 * Preset:
 * - date
 * 
 * - label? (optional, otherwise generated from practiceType)
 * 
 * - duration? (optional, how long did the practice last in minutes)
 * 
 * - practiceType (which sequence was practiced out of PRIMARY | INTERMEDIATE | ADVANCED_A | ADVANCED_B)
 * - ScoredPoses: 
 * -- array of strings representing the slugs of poses that the user wishes to fill out a ScoreCard for (set's the `scored` flag on the ScoreCard to true - better UX so that the user isn't stuck filling out dozens of ScoreCards for poses which they don't care about tracking details for)
 * 
 * 
 * 

 * Custom: 
 * - date
 * 
 * - label? (optional, otherwise generated from practiceType)
 * 
 * - duration? (optional, how long did the practice last in minutes)
 * 
 * - sequenceSnippets:
 * -- array of objects with key value pair structured as { group: PRIMARY | INTERMEDIATE | ADVANCED_A | ADVANCED_B, upToSlug: string (which pose did you go up to in that particular group)}
 * 
 * - ScoredPoses: 
 * -- array of strings representing the slugs of poses that the user wishes to fill out a ScoreCard for (set's the `scored` flag on the ScoreCard to true - better UX so that the user isn't stuck filling out dozens of ScoreCards for poses which they don't care about tracking details for)
 * 
 */

const presetBodySchema = z.object(
    {
        date: z.coerce.date().optional(), // if not provided, will default to current date
        label: z.string().optional(),
        duration: z.number().min(1).optional(),
        overallScore: z.number().min(1).max(10).optional(),
        energyLevel: z.number().min(1).max(10).optional(),
        mood: z.number().min(1).max(10).optional(),
        notes: z.string().optional(),
        practiceType: z.enum(PracticeType),
        scoredPoses: z.array(z.string()).optional() //If not provided, will default to all poses in the plan being unscored
    }
)

const customBodySchema = z.object(
    {
        date: z.coerce.date().optional(), // if not provided, will default to current date
        label: z.string().optional(), // will add some logic for this to default to the combination of segments - i.e. Primary + Partial (Intermediate | Advanced (A | B) )
        duration: z.number().min(1).optional(),
        overallScore: z.number().min(1).max(10).optional(),
        energyLevel: z.number().min(1).max(10).optional(),
        mood: z.number().min(1).max(10).optional(),
        notes: z.string().optional(),
        practiceType: z.literal(PracticeType.CUSTOM),
        sequenceSnippets: z.array(
            z.object(
                {
                    group: z.enum(["PRIMARY", "INTERMEDIATE", "ADVANCED_A", "ADVANCED_B"]),
                    upToSlug: z.string()
                }
            )
        ),
        scoredPoses: z.array(z.string()).optional() //If not provided, will default to all poses in the plan being unscored
    }
)


function populatePresetPlan(input: z.infer<typeof presetBodySchema>): PlanItem[] {
    const plan: PlanItem[] = [];

    const sunSalutations = toPlanItems('SUN', namesFromGroupKey('SUN'));
    const standing = toPlanItems('STANDING', namesFromGroupKey('STANDING'));
    const backbending = toPlanItems('BACKBENDING', namesFromGroupKey('BACKBENDING'));
    const finishing = toPlanItems('FINISHING', namesFromGroupKey('FINISHING'));

    plan.push(...sunSalutations);
    plan.push(...standing);

    switch (input.practiceType) {
        case 'CUSTOM': {
            throw new Error('CUSTOM practiceType not supported in preset plan population');
        }
        case 'HALF_PRIMARY': {
            const names = sliceBySlug(primaryOnly.map(p => p.name), 'navasana')
            plan.push(...toPlanItems('PRIMARY_ONLY', names));
            break;
        }
        case 'FULL_PRIMARY': {
            plan.push(...toPlanItems('PRIMARY_ONLY', namesFromGroupKey('PRIMARY_ONLY')));
            break;
        }
        case 'INTERMEDIATE': {
            plan.push(...toPlanItems('INTERMEDIATE_ONLY', namesFromGroupKey('INTERMEDIATE_ONLY')));
            break;
        }
        case 'ADVANCED_A': {
            plan.push(...toPlanItems('ADVANCED_A_ONLY', namesFromGroupKey('ADVANCED_A_ONLY')));
            break;
        }
        case 'ADVANCED_B': {
            plan.push(...toPlanItems('ADVANCED_B_ONLY', namesFromGroupKey('ADVANCED_B_ONLY')));
            break;
        }
    }

    plan.push(...backbending);
    plan.push(...finishing)
    return plan;
}

function populateCustomPlan(input: z.infer<typeof customBodySchema>): PlanItem[] {
    const plan: PlanItem[] = []
    const sunSalutations = toPlanItems('SUN', namesFromGroupKey('SUN'));
    const standing = toPlanItems('STANDING', namesFromGroupKey('STANDING'));
    const backbending = toPlanItems('BACKBENDING', namesFromGroupKey('BACKBENDING'));
    const finishing = toPlanItems('FINISHING', namesFromGroupKey('FINISHING'));

    for (const segment of input.sequenceSnippets) {
        switch (segment.group) {
            case 'PRIMARY': {
                const names = sliceBySlug(primaryOnly.map(p => p.name), segment.upToSlug);
                plan.push(...toPlanItems('PRIMARY_ONLY', names));
                break;
            }
            case 'INTERMEDIATE': {
                const names = sliceBySlug(intermediateOnly.map(p => p.name), segment.upToSlug);
                plan.push(...toPlanItems('INTERMEDIATE_ONLY', names));
                break;
            }
            case 'ADVANCED_A': {
                const names = sliceBySlug(advancedAOnly.map(p => p.name), segment.upToSlug);
                plan.push(...toPlanItems('ADVANCED_A_ONLY', names));
                break;
            }
            case 'ADVANCED_B': {
                const names = sliceBySlug(advancedBOnly.map(p => p.name), segment.upToSlug);
                plan.push(...toPlanItems('ADVANCED_B_ONLY', names));
                break;
            }
            default: {
                throw new Error(`Invalid group key: ${segment.group}`);
            }
        }
    }

    return [...sunSalutations, ...standing, ...plan, ...backbending, ...finishing];
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
        items: PlanItem[];
        scoredPoses: string[] | undefined; //if undefined, will default to all poses in the plan being unscored
    }
) {
    const { tx, userId, date, label, notes, practiceType, items, duration, scoredPoses, overallScore, energyLevel, mood } = params;

    const session = await tx.practiceSession.create(
        {
            data: {
                userId,
                date: date || new Date(),
                label: label || `${practiceType} Practice - ${new Date().toLocaleDateString()}`,
                overallScore: overallScore || null,
                energyLevel: energyLevel || null,
                mood: mood || null,
                notes: notes || null,
                practiceType,
                durationMinutes: duration || null,
                status: 'DRAFT'
            }
        }
    )

    const uniqueSlugs = Array.from(new Set(items.map(i => i.slug)));
    const poseMap = await fetchPosesBySlug(tx, uniqueSlugs);
    const scoredPoseSet = scoredPoses !== undefined ? new Set(scoredPoses) : undefined;

    let order = 1;
    const data: Prisma.ScoreCardCreateManyInput[] = [];
    for (const it of params.items) {
        const pose = poseMap.get(it.slug)!;
        const isScored = scoredPoseSet ? scoredPoseSet.has(pose.slug) : false;
        if (pose.isTwoSided) {
            data.push(
                { sessionId: session.id, poseId: pose.id, orderInSession: order++, segment: it.segment, side: 'RIGHT', skipped: false, scored: isScored },
                { sessionId: session.id, poseId: pose.id, orderInSession: order++, segment: it.segment, side: 'LEFT', skipped: false, scored: isScored },
            );
        } else {
            data.push({ sessionId: session.id, poseId: pose.id, orderInSession: order++, segment: it.segment, side: 'NA', skipped: false, scored: isScored });
        }
    }

    await tx.scoreCard.createMany({ data });

    return await tx.practiceSession.findUnique({
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
                orderBy: { orderInSession: 'asc' },
                select: {
                    id: true,
                    side: true,
                    pose: {
                        select: {
                            slug: true,
                            sequenceGroup: true
                        }
                    },
                    scored: true
                },
            }
        },
    });
}


export const createPresetSession = async (req: Request, res: Response) => {
    const client = req.user as { id: string } | undefined;
    if (!client?.id) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    // const body = presetBodySchema.parse(req.body);
    const parsed = presetBodySchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(422).json({
            message: "Invalid input",
            issues: parsed.error.issues.map(i => ({
                path: i.path.join('.'),
                message: i.message,
            })),
        });
    }
    const body = parsed.data;


    if (body.practiceType === PracticeType.CUSTOM) {
        return res.status(400).json({ message: "Invalid practiceType for preset session" });
    }

    const planItems = populatePresetPlan(body);
    const session = await prisma.$transaction(
        async (tx) => {
            return await buildSessionWithScoreCards(
                {
                    tx,
                    userId: client.id,
                    date: body.date,
                    label: body.label,
                    notes: body.notes,
                    overallScore: body.overallScore,
                    energyLevel: body.energyLevel,
                    mood: body.mood,
                    practiceType: body.practiceType,
                    items: planItems,
                    duration: body.duration,
                    scoredPoses: body.scoredPoses
                }
            )
        }
    )

    res.status(201).json({ session });
}

export const createCustomSession = async (req: Request, res: Response) => {
    const client = req.user as { id: string } | undefined;
    if (!client?.id) {
        return res.status(401).json({ message: "Unauthorized" });
    }



    // const body = customBodySchema.parse(req.body);

    const parsed = customBodySchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(422).json({
            message: "Invalid input",
            issues: parsed.error.issues.map(i => ({
                path: i.path.join('.'),
                message: i.message,
            })),
        });
    }

    const body = parsed.data;

    if (body.practiceType !== PracticeType.CUSTOM) {
        return res.status(400).json({ message: "Invalid practiceType for custom session" });
    }
    const planItems = populateCustomPlan(body);


    const session = await prisma.$transaction(
        async (tx) => {
            return await buildSessionWithScoreCards(
                {
                    tx,
                    userId: client.id,
                    date: body.date,
                    label: body.label,
                    overallScore: body.overallScore,
                    energyLevel: body.energyLevel,
                    mood: body.mood,
                    notes: body.notes,
                    practiceType: body.practiceType,
                    items: planItems,
                    duration: body.duration,
                    scoredPoses: body.scoredPoses
                }
            )
        }
    )

    res.status(201).json({ session });
}