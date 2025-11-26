/* scripts/backfill30Days.ts
 * Create 30 days of PracticeSessions + ScoreCards with filled metrics.
 * Run with:  tsx scripts/backfill30Days.ts
 */

import { Prisma, SequenceGroup, SequenceSegment, PracticeType } from '@prisma/client';
import prisma from '../lib/prisma';
import { computeOverallScore } from '../lib/utils';

// --- Config ---------------------------------------------------------------

const DAYS = 30;
const USER_ID = process.env.USER_ID ?? undefined;   // or set USER_EMAIL
console.log('Using USER_ID:', USER_ID);
const USER_EMAIL = process.env.USER_EMAIL ?? undefined;

// bias knobs (tweak to taste)
const GOOD_DAY_PROB = 0.55;     // chance that it's a "good" day
const BASE_DURATION_MIN = [60, 75, 90, 105, 120]; // pick one
const SUN_A_REPS = 5;
const SUN_B_REPS = 3;

// --- Utilities ------------------------------------------------------------

const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
};

const endOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
};

const randChoice = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Return a value ~ N(mean, sd) clipped to [lo, hi], rounded to int */
function randNormInt(mean: number, sd: number, lo = 1, hi = 10) {
    // Box–Muller
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    const val = Math.round(mean + sd * z);
    return clamp(val, lo, hi);
}

/** Map Pose.sequenceGroup → ScoreCard.segment; fix SUN A/B by name */
function segmentForPose(sequenceGroup: SequenceGroup, poseName: string): SequenceSegment {
    if (sequenceGroup === 'SUN_SALUTATIONS') {
        return /surya\s+namaskar\s+b/i.test(poseName) ? 'SUN_B' : 'SUN_A';
    }
    switch (sequenceGroup) {
        case 'STANDING': return 'STANDING';
        case 'PRIMARY': return 'PRIMARY';
        case 'INTERMEDIATE': return 'INTERMEDIATE';
        case 'ADVANCED_A': return 'ADVANCED_A';
        case 'ADVANCED_B': return 'ADVANCED_B';
        case 'BACKBENDING': return 'BACKBENDING';
        case 'FINISHING': return 'FINISHING';
        default: return 'STANDING';
    }
}

/** Picks a practiceType and mid-block selection pattern */
type MidPlan = {
    practiceType: PracticeType;
    label: string;
    groups: { key: SequenceGroup; count?: number; uptoIndex?: number }[]; // count/uptoIndex for partials
};

function randomMidPlan(primary: any[], intermediate: any[], advA: any[], advB: any[]): MidPlan {
    // weights by “typicality”
    const options: (() => MidPlan)[] = [
        () => ({
            practiceType: 'FULL_PRIMARY',
            label: 'Full Primary',
            groups: [{ key: 'PRIMARY' }],
        }),
        () => ({
            practiceType: 'HALF_PRIMARY',
            label: 'Half Primary',
            groups: [{ key: 'PRIMARY', uptoIndex: Math.max(5, randInt(8, Math.max(8, primary.length - 1))) }],
        }),
        () => ({
            practiceType: 'PRIMARY_PLUS_INTERMEDIATE',
            label: 'Primary + Partial Intermediate',
            groups: [
                { key: 'PRIMARY' },
                { key: 'INTERMEDIATE', uptoIndex: Math.max(5, randInt(10, Math.max(10, intermediate.length - 1))) },
            ],
        }),
        () => ({
            practiceType: 'FULL_INTERMEDIATE',
            label: 'Full Intermediate',
            groups: [{ key: 'INTERMEDIATE' }],
        }),
        () => ({
            practiceType: 'INTERMEDIATE_PLUS_ADVANCED',
            label: 'Intermediate + Partial Adv A',
            groups: [
                { key: 'INTERMEDIATE' },
                { key: 'ADVANCED_A', uptoIndex: Math.max(5, randInt(8, Math.max(8, advA.length - 1))) },
            ],
        }),
        () => ({
            practiceType: 'ADVANCED_A',
            label: 'Advanced A (partial)',
            groups: [{ key: 'ADVANCED_A', uptoIndex: Math.max(8, randInt(12, Math.max(12, advA.length - 1))) }],
        }),
        () => ({
            practiceType: 'ADVANCED_B',
            label: 'Advanced B (partial)',
            groups: [{ key: 'ADVANCED_B', uptoIndex: Math.max(6, randInt(10, Math.max(10, advB.length - 1))) }],
        }),
        () => ({
            practiceType: 'ADVANCED_A',
            label: 'Full Advanced A',
            groups: [{ key: 'ADVANCED_A'}],
        }),
        () => ({
            practiceType: 'ADVANCED_B',
            label: 'Full Advanced B',
            groups: [{ key: 'ADVANCED_B'}],
        }),
    ];

    // bias toward Primary-heavy weeks
    const pick = randChoice([0, 0, 1, 2, 3, 3, 4, 5, 6, 7, 8]);
    return options[pick]();
}

// --- Main -----------------------------------------------------------------

async function resolveUserId(): Promise<string> {
    if (USER_ID) return USER_ID;
    if (USER_EMAIL) {
        const u = await prisma.user.findUnique({ where: { email: USER_EMAIL }, select: { id: true } });
        if (!u) throw new Error(`No user found for email ${USER_EMAIL}`);
        return u.id;
    }
    const first = await prisma.user.findFirst({ select: { id: true, email: true, name: true } });
    if (!first) throw new Error('No users found. Create a user first.');
    console.warn(`⚠️ USER_ID not provided; using first user: ${first.email ?? first.id}`);
    return first.id;
}

async function loadPoseCatalog() {
    const poses = await prisma.pose.findMany({
        orderBy: [{ sequenceGroup: 'asc' }, { orderInGroup: 'asc' }],
        select: { id: true, sanskritName: true, isTwoSided: true, sequenceGroup: true },
    });

    // group
    const by = <T extends SequenceGroup>(key: T) =>
        poses.filter(p => p.sequenceGroup === key);

    return {
        sun: by('SUN_SALUTATIONS'),
        standing: by('STANDING'),
        primary: by('PRIMARY'),
        intermediate: by('INTERMEDIATE'),
        advA: by('ADVANCED_A'),
        advB: by('ADVANCED_B'),
        finishing: by('FINISHING'),
    };
}

async function createDay(
    userId: string,
    date: Date,
    catalog: Awaited<ReturnType<typeof loadPoseCatalog>>
) {
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    // Idempotency: wipe any existing sessions for this user on this day
    await prisma.practiceSession.deleteMany({
        where: { userId, date: { gte: dayStart, lte: dayEnd } },
    });

    // Decide session mid-plan
    const mid = randomMidPlan(catalog.primary, catalog.intermediate, catalog.advA, catalog.advB);

    // Compose ordered pose list for the session
    const pickUpto = (arr: typeof catalog.primary, idx?: number) =>
        typeof idx === 'number' ? arr.slice(0, Math.min(Math.max(1, idx), arr.length)) : arr;

    const midPoses = mid.groups.flatMap(g => {
        const arr =
            g.key === 'PRIMARY' ? catalog.primary :
                g.key === 'INTERMEDIATE' ? catalog.intermediate :
                    g.key === 'ADVANCED_A' ? catalog.advA :
                        g.key === 'ADVANCED_B' ? catalog.advB : [];
        return pickUpto(arr, g.uptoIndex);
    });

    const ordered = [
        ...catalog.sun,
        ...catalog.standing,
        ...midPoses,
        ...catalog.finishing,
    ];

    // Day “quality” affects metrics
    const isGoodDay = Math.random() < GOOD_DAY_PROB;
    const baseGood = isGoodDay ? 7.2 : 5.8;   // avg for good vs meh days
    const sd = isGoodDay ? 1.1 : 1.4;

    // Build scorecards
    let order = 1;
    const scData: Prisma.ScoreCardCreateManyInput[] = [];
    for (const pose of ordered) {
        const seg = segmentForPose(pose.sequenceGroup, pose.sanskritName);

        // notes for sun salutation reps
        const maybeNotes =
            pose.sequenceGroup === 'SUN_SALUTATIONS'
                ? (/surya\s+namaskar\s+b/i.test(pose.sanskritName) ? `reps: ${SUN_B_REPS}` : `reps: ${SUN_A_REPS}`)
                : undefined;

        // Generate metrics (bias toward baseGood; pain inversely)
        const ease = randNormInt(baseGood, sd);
        const comfort = randNormInt(baseGood, sd);
        const stability = randNormInt(baseGood, sd);
        const breath = randNormInt(baseGood, sd);
        const focus = randNormInt(baseGood, sd);
        const pain = randNormInt(11 - baseGood, sd, 1, 10); // lower on good days

        const common = {
            orderInSession: order++,
            segment: seg,
            skipped: false,
            notes: maybeNotes,
            ease, comfort, stability, breath, focus, pain,
        };

        if (pose.isTwoSided) {
            // RIGHT
            const right = { ...common, side: 'RIGHT' as const };
            const rightOverall = computeOverallScore(right);
            scData.push({
                poseId: pose.id,
                sessionId: 'to-fill', // placeholder; replaced later
                ...right,
                overallScore: rightOverall ?? undefined,
            });

            // LEFT
            const left = {
                ...common,
                orderInSession: order++,
                side: 'LEFT' as const,
                // small asymmetry tweak
                ease: clamp(common.ease + randInt(-1, 1), 1, 10),
                stability: clamp(common.stability + randInt(-1, 1), 1, 10),
                pain: clamp(common.pain + randInt(-1, 1), 1, 10),
            };
            const leftOverall = computeOverallScore(left);
            scData.push({
                poseId: pose.id,
                sessionId: 'to-fill',
                ...left,
                overallScore: leftOverall ?? undefined,
            });
        } else {
            const single = { ...common, side: 'NA' as const };
            const singleOverall = computeOverallScore(single);
            scData.push({
                poseId: pose.id,
                sessionId: 'to-fill',
                ...single,
                overallScore: singleOverall ?? undefined,
            });
        }
    }

    // Session-level meta
    const energyLevel = randNormInt(isGoodDay ? 8 : 6, 1.0);
    const mood = randNormInt(isGoodDay ? 8 : 6, 1.0);
    const durationMinutes = randChoice(BASE_DURATION_MIN);

    // Create within a transaction
    const created = await prisma.$transaction(async (tx) => {
        const session = await tx.practiceSession.create({
            data: {
                userId,
                date: new Date(dayStart.getTime() + 12 * 60 * 60 * 1000), // noon to avoid tz edge cases
                label: `AutoSeed: ${mid.label}`,
                practiceType: mid.practiceType,
                status: 'PUBLISHED',
                energyLevel,
                mood,
                durationMinutes,
            },
        });

        // attach sessionId and bulk insert scorecards
        const toInsert: Prisma.ScoreCardCreateManyInput[] = scData.map(s => ({
            ...s,
            sessionId: session.id,
        }));

        await tx.scoreCard.createMany({ data: toInsert });

        // compute session overall (avg of non-skipped with overallScore)
        const cards = await tx.scoreCard.findMany({
            where: { sessionId: session.id, skipped: false, overallScore: { not: null } },
            select: { overallScore: true },
        });
        const avg =
            cards.length ? cards.reduce((sum, c) => sum + (c.overallScore ?? 0), 0) / cards.length : null;

        const updated = await tx.practiceSession.update({
            where: { id: session.id },
            data: { overallScore: avg ?? undefined },
            include: { scoreCards: { orderBy: { orderInSession: 'asc' } } },
        });

        return updated;
    });

    return created;
}

async function main() {
    const userId = await resolveUserId();
    const catalog = await loadPoseCatalog();

    // sanity checks
    if (!catalog.sun.length || !catalog.standing.length || !catalog.finishing.length) {
        throw new Error('Catalog missing SUN/STANDING/FINISHING poses. Did you seed poses?');
    }
    if (!catalog.primary.length && !catalog.intermediate.length && !catalog.advA.length && !catalog.advB.length) {
        throw new Error('No series poses found (PRIMARY/INTERMEDIATE/ADV_A/ADV_B).');
    }

    const today = startOfDay(new Date());

    for (let i = DAYS - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);

        const created = await createDay(userId, d, catalog);
        console.log(
            `✅ ${d.toISOString().slice(0, 10)} — ${created.label}  (${created.scoreCards.length} cards, overall=${created.overallScore ?? 'n/a'})`
        );
    }
}

main()
    .catch((e) => {
        console.error('❌ Backfill error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
