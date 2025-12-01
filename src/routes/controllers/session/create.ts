import prisma from "../../../lib/prisma";
import { SequenceSegment, PracticeType, Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { z } from 'zod';

// adjust to your actual path
import { CATALOG, primaryOnly, intermediateOnly, advancedAOnly, advancedBOnly, type GroupKey } from '../../../lib/sequenceDef';

/* --------------------------- Helpers & Types --------------------------- */

const slugify = (name: string) =>
    name.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

type PlanItem = {
    // we keep pose identity by name -> slug
    name: string;
    slug: string;
    // which UI segment this item will be displayed under
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

// choose SUN_A or SUN_B by pose name
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

function sliceBySlug(names: string[], opts: { fromSlug?: string; upToSlug?: string }): string[] {
    const indexed = names.map((n) => ({ n, s: slugify(n) }));
    const fromIdx = opts.fromSlug ? indexed.findIndex((x) => x.s === slugify(opts.fromSlug!)) : 0;
    const toIdx = opts.upToSlug ? indexed.findIndex((x) => x.s === slugify(opts.upToSlug!)) : indexed.length - 1;

    if (fromIdx === -1) throw new Error(`fromSlug not found: ${opts.fromSlug}`);
    if (toIdx === -1) throw new Error(`upToSlug not found: ${opts.upToSlug}`);
    if (toIdx < fromIdx) throw new Error(`Invalid range: upToSlug occurs before fromSlug`);

    return indexed.slice(fromIdx, toIdx + 1).map((x) => x.n);
}

// Pull Pose rows for all slugs we need (id + isTwoSided)
async function fetchPosesBySlug(slugs: string[]) {
    const rows = await prisma.pose.findMany({
        where: { slug: { in: slugs } },
        select: { id: true, slug: true, isTwoSided: true },
    });
    const map = new Map(rows.map((r) => [r.slug, r]));
    const missing = slugs.filter((s) => !map.has(s));
    if (missing.length) {
        throw new Error(`Missing Pose(s) in DB for slugs: ${missing.join(', ')}`);
    }
    return map;
}

/* --------------------------- Zod Schemas --------------------------- */

// PRESET controller input
const presetBodySchema = z.object({
    date: z.string().datetime().optional(),
    label: z.string().optional(),
    practiceType: z.nativeEnum(PracticeType).refine((v) => v !== 'CUSTOM', 'Use custom endpoint for CUSTOM'),
    // optional partial cutoffs
    halfPrimaryUpToSlug: z.string().optional(),      // default: 'navasana'
    intermediateUpToSlug: z.string().optional(),
    // for INTERMEDIATE_PLUS_ADVANCED you can specify series & cutoff
    advancedSeries: z.enum(['A', 'B']).optional().default('A'),
    advancedUpToSlug: z.string().optional(),
});

// CUSTOM controller input
const customBodySchema = z.object({
    date: z.string().datetime().optional(),
    label: z.string().optional(),
    practiceType: z.literal('CUSTOM'),
    blocks: z.array(z.object({
        group: z.enum(['PRIMARY_ONLY', 'INTERMEDIATE_ONLY', 'ADVANCED_A_ONLY', 'ADVANCED_B_ONLY'] as const),
        // either a range or explicit slugs list
        range: z.object({
            fromSlug: z.string().optional(),
            upToSlug: z.string().optional(),
        }).optional(),
        slugs: z.array(z.string()).optional(),
        // optional segment override if you ever need it
        overrideSegment: z.nativeEnum(SequenceSegment).optional(),
    })),
});

/* ------------------------ Plan Expansion (Preset) ------------------------ */

function namesFromGroupKey(key: GroupKey): string[] {
    return CATALOG[key].map((p) => p.name);
}

function expandPresetNames(input: z.infer<typeof presetBodySchema>): PlanItem[] {
    const sun = toPlanItems('SUN', namesFromGroupKey('SUN'));
    const standing = toPlanItems('STANDING', namesFromGroupKey('STANDING'));
    const finishing = toPlanItems('FINISHING', namesFromGroupKey('FINISHING'));

    const result: PlanItem[] = [];
    result.push(...sun, ...standing);

    switch (input.practiceType) {
        case 'FULL_PRIMARY': {
            result.push(...toPlanItems('PRIMARY_ONLY', namesFromGroupKey('PRIMARY_ONLY')));
            break;
        }
        case 'HALF_PRIMARY': {
            const upTo = input.halfPrimaryUpToSlug ?? 'navasana';
            const names = sliceBySlug(primaryOnly.map(p => p.name), { upToSlug: upTo });
            result.push(...toPlanItems('PRIMARY_ONLY', names));
            break;
        }
        case 'HALF_PRIMARY_PLUS_INTERMEDIATE': {
            const halfUpTo = input.halfPrimaryUpToSlug ?? 'navasana';
            const pNames = sliceBySlug(primaryOnly.map(p => p.name), { upToSlug: halfUpTo });
            result.push(...toPlanItems('PRIMARY_ONLY', pNames));

            const iNames = input.intermediateUpToSlug
                ? sliceBySlug(intermediateOnly.map(p => p.name), { upToSlug: input.intermediateUpToSlug })
                : intermediateOnly.map(p => p.name);
            result.push(...toPlanItems('INTERMEDIATE_ONLY', iNames));
            break;
        }
        case 'PRIMARY_PLUS_INTERMEDIATE': {
            result.push(...toPlanItems('PRIMARY_ONLY', namesFromGroupKey('PRIMARY_ONLY')));

            const iNames = input.intermediateUpToSlug
                ? sliceBySlug(intermediateOnly.map(p => p.name), { upToSlug: input.intermediateUpToSlug })
                : intermediateOnly.map(p => p.name);
            result.push(...toPlanItems('INTERMEDIATE_ONLY', iNames));
            break;
        }
        case 'FULL_INTERMEDIATE': {
            result.push(...toPlanItems('INTERMEDIATE_ONLY', namesFromGroupKey('INTERMEDIATE_ONLY')));
            break;
        }
        case 'INTERMEDIATE_PLUS_ADVANCED': {
            result.push(...toPlanItems('INTERMEDIATE_ONLY', namesFromGroupKey('INTERMEDIATE_ONLY')));

            if (input.advancedSeries === 'A') {
                const aNames = input.advancedUpToSlug
                    ? sliceBySlug(advancedAOnly.map(p => p.name), { upToSlug: input.advancedUpToSlug })
                    : advancedAOnly.map(p => p.name);
                result.push(...toPlanItems('ADVANCED_A_ONLY', aNames));
            } else {
                const bNames = input.advancedUpToSlug
                    ? sliceBySlug(advancedBOnly.map(p => p.name), { upToSlug: input.advancedUpToSlug })
                    : advancedBOnly.map(p => p.name);
                result.push(...toPlanItems('ADVANCED_B_ONLY', bNames));
            }
            break;
        }
        case 'ADVANCED_A': {
            result.push(...toPlanItems('ADVANCED_A_ONLY', namesFromGroupKey('ADVANCED_A_ONLY')));
            break;
        }
        case 'ADVANCED_B': {
            result.push(...toPlanItems('ADVANCED_B_ONLY', namesFromGroupKey('ADVANCED_B_ONLY')));
            break;
        }
        default:
            throw new Error(`Unsupported preset type: ${input.practiceType}`);
    }

    result.push(...finishing);
    return result;
}

/* ------------------------ Plan Expansion (Custom) ------------------------ */

function expandCustomNames(input: z.infer<typeof customBodySchema>): PlanItem[] {
    const sun = toPlanItems('SUN', namesFromGroupKey('SUN'));
    const standing = toPlanItems('STANDING', namesFromGroupKey('STANDING'));
    const finishing = toPlanItems('FINISHING', namesFromGroupKey('FINISHING'));

    const middle: PlanItem[] = [];

    for (const block of input.blocks) {
        const source = CATALOG[block.group];
        if (!source) throw new Error(`Unknown group: ${block.group}`);

        let names: string[] = source.map(p => p.name);

        if (block.slugs && block.slugs.length) {
            // explicit list
            const wanted = new Set(block.slugs.map(slugify));
            names = source.map(p => p.name).filter(n => wanted.has(slugify(n)));
            // keep canonical order
        } else if (block.range && (block.range.fromSlug || block.range.upToSlug)) {
            names = sliceBySlug(source.map(p => p.name), {
                fromSlug: block.range.fromSlug,
                upToSlug: block.range.upToSlug,
            });
        }

        const items = toPlanItems(block.group, names);
        // optional segment override
        middle.push(...(block.overrideSegment ? items.map(i => ({ ...i, segment: block.overrideSegment! })) : items));
    }

    return [...sun, ...standing, ...middle, ...finishing];
}

/* --------------------------- Materialization --------------------------- */

async function materializeSessionWithCards(params: {
    userId: string;
    date?: string;
    label?: string;
    practiceType: PracticeType;
    items: PlanItem[];
}) {
    return await prisma.$transaction(async (tx) => {
        // 1) Create the PracticeSession (DRAFT)
        const session = await tx.practiceSession.create({
            data: {
                userId: params.userId,
                date: params.date ? new Date(params.date) : new Date(),
                label: params.label,
                practiceType: params.practiceType,
                status: 'DRAFT',
            },
        });

        // 2) Fetch pose rows for all slugs
        const uniqueSlugs = Array.from(new Set(params.items.map(i => i.slug)));
        const poseMap = await fetchPosesBySlug(uniqueSlugs);

        // 3) Build createMany payload (order + side split)
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

        // 4) Insert all scorecards
        await tx.scoreCard.createMany({ data });

        // 5) Return session + cards
        const withCards = await tx.practiceSession.findUnique({
            where: { id: session.id },
            include: { scoreCards: { orderBy: { orderInSession: 'asc' } } },
        });

        return withCards!;
    });
}

/* ----------------------------- Controllers ----------------------------- */

// POST /api/sessions/preset
export async function createPresetSession(req: Request, res: Response) {
    try {
        const body = presetBodySchema.parse(req.body);
        const userId = (req as any).auth?.userId || (req as any).user?.id || req.body.userId; // adapt to your auth
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const items = expandPresetNames(body);
        const session = await materializeSessionWithCards({
            userId,
            date: body.date,
            label: body.label ?? humanizeLabelFromPreset(body),
            practiceType: body.practiceType,
            items,
        });

        res.status(201).json({ session });
    } catch (err: any) {
        res.status(400).json({ error: err?.message ?? 'Bad Request' });
    }
}

export async function getSessionById(req: Request, res: Response) {
    try {
        
        const { id } = req.params;
        const session = await prisma.practiceSession.findUnique({
            where: { id },
            include: { scoreCards: { orderBy: { orderInSession: 'asc' } } },
        });
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }
        res.json({ session });
    } catch (err: any) {
        res.status(400).json({ error: err?.message ?? 'Bad Request' });
    }
}

export async function getAllSessions(req: Request, res: Response) {
    // cast req.user to a shape that includes `id` (adjust to your auth user type)
    const client = req.user as { id: string } | undefined;

    if (!client?.id) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const sessions = await prisma.practiceSession.findMany({
        where: {
            userId: client.id,
        },
        select: {
            id: true,
            userId: true,
            date: true,
        },
        orderBy: { date: 'desc' },
    });
    console.log(sessions.length)
    if (!sessions.length) return res.status(404).json({ message: "No sessions found." });
    res.json({ sessions });

}

// POST /api/sessions/custom
export async function createCustomSession(req: Request, res: Response) {
    try {
        const body = customBodySchema.parse(req.body);
        const userId = (req as any).auth?.userId || (req as any).user?.id || req.body.userId;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const items = expandCustomNames(body);
        const session = await materializeSessionWithCards({
            userId,
            date: body.date,
            label: body.label ?? 'Custom Practice',
            practiceType: 'CUSTOM',
            items,
        });

        res.status(201).json({ session });
    } catch (err: any) {
        res.status(400).json({ error: err?.message ?? 'Bad Request' });
    }
}

/* ----------------------------- Utilities ------------------------------ */

function humanizeLabelFromPreset(body: z.infer<typeof presetBodySchema>): string {
    const base = body.practiceType
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/^\w/, (c) => c.toUpperCase());

    // add quick hints for cutoffs if specified
    const extras: string[] = [];
    if (body.practiceType.includes('HALF_PRIMARY') && body.halfPrimaryUpToSlug) {
        extras.push(`to ${body.halfPrimaryUpToSlug}`);
    }
    if ((body.practiceType.includes('INTERMEDIATE')) && body.intermediateUpToSlug) {
        extras.push(`+ Int to ${body.intermediateUpToSlug}`);
    }
    if (body.practiceType === 'INTERMEDIATE_PLUS_ADVANCED' && body.advancedUpToSlug) {
        extras.push(`+ Adv ${body.advancedSeries} to ${body.advancedUpToSlug}`);
    }

    return extras.length ? `${base} (${extras.join(' ')})` : base;
}
