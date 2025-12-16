import prisma from "../../../lib/prisma";
import { SequenceSegment, PracticeType, Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { z } from 'zod';

import { CATALOG, primaryOnly, intermediateOnly, advancedAOnly, advancedBOnly, type GroupKey } from '../../../lib/sequenceDef';



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
 */

const presetBodySchema = z.object(
    {
        date: z.coerce.date().optional(), // if not provided, will default to current date
        label: z.string().optional(),
        duration: z.number().min(1).optional(),
        practiceType: z.enum(PracticeType)
    }
)

const customBodySchema = z.object(
    {
        date: z.coerce.date().optional(), // if not provided, will default to current date
        label: z.string().optional(), // will add some logic for this to default to the combination of segments - i.e. Primary + Partial (Intermediate | Advanced (A | B) )
        duration: z.number().min(1).optional(),
        practiceType: z.literal(PracticeType.CUSTOM),
        sequenceSnippets: z.array(
            z.object(
                {
                    group: z.enum(["PRIMARY", "INTERMEDIATE", "ADVANCED_A", "ADVANCED_B"]),
                    upToSlug: z.string()
                }
            )
        )
    }
)


function populatePresetPlan(input: z.infer<typeof presetBodySchema>): PlanItem[] {
    const plan: PlanItem[] = [];

    const sunSalutations = toPlanItems('SUN', namesFromGroupKey('SUN'));
    const standing = toPlanItems('STANDING', namesFromGroupKey('STANDING'));
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


    plan.push(...finishing)
    return plan;
}

function populateCustomPlan(input: z.infer<typeof customBodySchema>): PlanItem[] {
    const plan: PlanItem[] = []
    const sunSalutations = toPlanItems('SUN', namesFromGroupKey('SUN'));
    const standing = toPlanItems('STANDING', namesFromGroupKey('STANDING'));
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

    return [...sunSalutations, ...standing, ...plan, ...finishing];
}

async function buildSessionWithScoreCards(
    params: {
        tx: Prisma.TransactionClient;
        userId: string;
        date?: Date;
        label?: string;
        duration?: number;
        practiceType: PracticeType;
        items: PlanItem[];
    }
) {
    const { tx, userId, date, label, practiceType, items, duration } = params;

    const session = await tx.practiceSession.create(
        {
            data: {
                userId,
                date: date || new Date(),
                label: label || `${practiceType} Practice - ${new Date().toLocaleDateString()}`,
                practiceType,
                durationMinutes: duration || null,
                status: 'DRAFT'
            }
        }
    )

    const uniqueSlugs = Array.from(new Set(items.map(i => i.slug)));
    const poseMap = await fetchPosesBySlug(tx, uniqueSlugs);

    let order = 1;
    const data: Prisma.ScoreCardCreateManyInput[] = [];
    for (const it of params.items) {
        const pose = poseMap.get(it.slug)!;
        if (pose.isTwoSided) {
            data.push(
                { sessionId: session.id, poseId: pose.id, orderInSession: order++, segment: it.segment, side: 'RIGHT', skipped: false },
                { sessionId: session.id, poseId: pose.id, orderInSession: order++, segment: it.segment, side: 'LEFT', skipped: false },
            );
        } else {
            data.push({ sessionId: session.id, poseId: pose.id, orderInSession: order++, segment: it.segment, side: 'NA', skipped: false });
        }
    }

    await tx.scoreCard.createMany({ data });

    return await tx.practiceSession.findUnique({
        where: { id: session.id },
        select: { 
            id: true,
            date: true,
            label: true,
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
                    }
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

    const body = presetBodySchema.parse(req.body);

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
                    practiceType: body.practiceType,
                    items: planItems,
                    duration: body.duration
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



    const body = customBodySchema.parse(req.body);

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
                    practiceType: body.practiceType,
                    items: planItems,
                    duration: body.duration
                }
            )
        }
    )

    res.status(201).json({ session });
}