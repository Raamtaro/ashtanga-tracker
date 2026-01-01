/* scripts/backfill30Days.ts
 * Create 30 days of PracticeSessions + ScoreCards with filled metrics.
 * Run with:  tsx scripts/backfill30Days.ts
 */

import { Prisma, SequenceGroup, SequenceSegment, PracticeType, Side, Status } from "@prisma/client";
import prisma from "../lib/prisma";

// --- Config ---------------------------------------------------------------

const DAYS = Number(process.env.DAYS ?? 30);

const USER_ID = process.env.USER_ID ?? undefined; // or set USER_EMAIL
const USER_EMAIL = process.env.USER_EMAIL ?? undefined;

// bias knobs (tweak to taste)
const GOOD_DAY_PROB = 0.55; // chance that it's a "good" day
const BASE_DURATION_MIN = [60, 75, 90, 105, 120]; // pick one
const SUN_A_REPS = 5;
const SUN_B_REPS = 3;

// If true, deletes any sessions for that user in the date window first
const WIPE_WINDOW = (process.env.WIPE_WINDOW ?? "true").toLowerCase() === "true";

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
    let u = 0,
        v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    const val = Math.round(mean + sd * z);
    return clamp(val, lo, hi);
}

/** Your current backend computeOverall is a straight average — keep this aligned. */
function computeOverallScore(metrics: {
    ease?: number | null;
    comfort?: number | null;
    stability?: number | null;
    pain?: number | null;
    breath?: number | null;
    focus?: number | null;
    skipped?: boolean;
}): number | null {
    if (metrics.skipped) return null;
    const vals = [metrics.ease, metrics.comfort, metrics.stability, metrics.pain, metrics.breath, metrics.focus].filter(
        (v): v is number => typeof v === "number"
    );
    if (!vals.length) return null;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return Math.round(avg * 100) / 100;
}

/** Map Pose.sequenceGroup → ScoreCard.segment; special-case SUN A/B by name */
function segmentForPose(sequenceGroup: SequenceGroup, poseName: string): SequenceSegment {
    if (sequenceGroup === "SUN_SALUTATIONS") {
        return /surya\s+namaskar\s+b/i.test(poseName) ? "SUN_B" : "SUN_A";
    }
    switch (sequenceGroup) {
        case "STANDING":
            return "STANDING";
        case "PRIMARY":
            return "PRIMARY";
        case "INTERMEDIATE":
            return "INTERMEDIATE";
        case "ADVANCED_A":
            return "ADVANCED_A";
        case "ADVANCED_B":
            return "ADVANCED_B";
        case "BACKBENDING":
            return "BACKBENDING";
        case "FINISHING":
            return "FINISHING";
        default:
            return "STANDING";
    }
}

/** Force canonical flow ordering (don’t rely on enum sort). */
const GROUP_FLOW_ORDER: Record<SequenceGroup, number> = {
    WARMUP: 0,
    SUN_SALUTATIONS: 1,
    STANDING: 2,
    PRIMARY: 3,
    INTERMEDIATE: 4,
    ADVANCED_A: 5,
    ADVANCED_B: 6,
    BACKBENDING: 7,
    FINISHING: 8,
    OTHER: 9,
};

type PoseRow = {
    id: string;
    slug: string;
    sanskritName: string;
    isTwoSided: boolean;
    sequenceGroup: SequenceGroup;
    orderInGroup: number | null;
};

async function resolveUserId(): Promise<string> {
    if (USER_ID) return USER_ID;

    if (USER_EMAIL) {
        const u = await prisma.user.findUnique({ where: { email: USER_EMAIL }, select: { id: true } });
        if (!u) throw new Error(`No user found for email ${USER_EMAIL}`);
        return u.id;
    }

    const first = await prisma.user.findFirst({ select: { id: true, email: true } });
    if (!first) throw new Error("No users found. Create a user first.");
    console.warn(`⚠️ USER_ID not provided; using first user: ${first.email ?? first.id}`);
    return first.id;
}

async function loadPoseCatalog() {
    const poses: PoseRow[] = await prisma.pose.findMany({
        select: {
            id: true,
            slug: true,
            sanskritName: true,
            isTwoSided: true,
            sequenceGroup: true,
            orderInGroup: true,
        },
    });

    // group + sort
    const by = (key: SequenceGroup) =>
        poses
            .filter((p) => p.sequenceGroup === key)
            .sort((a, b) => {
                const oa = a.orderInGroup ?? 1_000_000;
                const ob = b.orderInGroup ?? 1_000_000;
                if (oa !== ob) return oa - ob;
                return a.sanskritName.localeCompare(b.sanskritName);
            });

    return {
        sun: by("SUN_SALUTATIONS"),
        standing: by("STANDING"),
        primary: by("PRIMARY"),
        intermediate: by("INTERMEDIATE"),
        advA: by("ADVANCED_A"),
        advB: by("ADVANCED_B"),
        backbending: by("BACKBENDING"),
        finishing: by("FINISHING"),
    };
}

/** Weighted pick of practice types (aligned to your current enum). */
function randomPracticeType(): PracticeType {
    // tweak weights however you want
    const roll = Math.random();
    if (roll < 0.48) return "FULL_PRIMARY";
    if (roll < 0.63) return "ADVANCED_B";
    if (roll < 0.83) return "INTERMEDIATE";
    if (roll < 0.93) return "ADVANCED_A";
    return "ADVANCED_B";
}

function halfPrimaryCutIndex(primary: PoseRow[]) {
    // prefer canonical cut at navasana if available
    const idx = primary.findIndex((p) => p.slug === "navasana");
    if (idx !== -1) return idx + 1;

    // fallback: pick a reasonable mid-point
    return Math.max(10, Math.min(primary.length, randInt(12, 22)));
}

function buildMidPoses(catalog: Awaited<ReturnType<typeof loadPoseCatalog>>, t: PracticeType): PoseRow[] {
    if (t === "FULL_PRIMARY") return [...catalog.primary];

    if (t === "HALF_PRIMARY") {
        const cut = halfPrimaryCutIndex(catalog.primary);
        return catalog.primary.slice(0, cut);
    }

    // INTERMEDIATE / ADVANCED_* should include Primary (ashtanga reality)
    if (t === "INTERMEDIATE") return [...catalog.primary, ...catalog.intermediate];
    if (t === "ADVANCED_A") return [...catalog.primary, ...catalog.intermediate, ...catalog.advA];
    if (t === "ADVANCED_B") return [...catalog.primary, ...catalog.intermediate, ...catalog.advA, ...catalog.advB];

    return [...catalog.primary];
}

async function createDay(userId: string, date: Date, catalog: Awaited<ReturnType<typeof loadPoseCatalog>>) {
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    // Idempotency: wipe any existing sessions for this user on this day
    await prisma.practiceSession.deleteMany({
        where: { userId, date: { gte: dayStart, lte: dayEnd } },
    });

    const practiceType = randomPracticeType();
    const label = `AutoSeed: ${practiceType}`;

    const midPoses = buildMidPoses(catalog, practiceType);

    // Compose ordered pose list for the session
    const ordered: PoseRow[] = [
        ...catalog.sun,
        ...catalog.standing,
        ...midPoses,
        ...catalog.backbending, // if empty, fine
        ...catalog.finishing,
    ].sort((a, b) => {
        const ga = GROUP_FLOW_ORDER[a.sequenceGroup] ?? 999;
        const gb = GROUP_FLOW_ORDER[b.sequenceGroup] ?? 999;
        if (ga !== gb) return ga - gb;

        const oa = a.orderInGroup ?? 1_000_000;
        const ob = b.orderInGroup ?? 1_000_000;
        if (oa !== ob) return oa - ob;

        return a.sanskritName.localeCompare(b.sanskritName);
    });

    // Day “quality” affects metrics
    const isGoodDay = Math.random() < GOOD_DAY_PROB;
    const baseGood = isGoodDay ? 7.2 : 5.8;
    const sd = isGoodDay ? 1.1 : 1.4;

    let order = 1;
    const scData: Prisma.ScoreCardCreateManyInput[] = [];

    for (const pose of ordered) {
        const seg = segmentForPose(pose.sequenceGroup, pose.sanskritName);

        const maybeNotes =
            pose.sequenceGroup === "SUN_SALUTATIONS"
                ? /surya\s+namaskar\s+b/i.test(pose.sanskritName)
                    ? `reps: ${SUN_B_REPS}`
                    : `reps: ${SUN_A_REPS}`
                : undefined;

        const skipped = false;

        // IMPORTANT: pain here uses same direction as other metrics (higher = “better”)
        // so it aligns with your current overallScore averaging.
        const ease = randNormInt(baseGood, sd);
        const comfort = randNormInt(baseGood, sd);
        const stability = randNormInt(baseGood, sd);
        const breath = randNormInt(baseGood, sd);
        const focus = randNormInt(baseGood, sd);
        const pain = randNormInt(baseGood, sd);

        const mk = (side: Side, tweak?: Partial<Record<"ease" | "comfort" | "stability" | "breath" | "focus" | "pain", number>>) => {
            const m = {
                ease: tweak?.ease ?? ease,
                comfort: tweak?.comfort ?? comfort,
                stability: tweak?.stability ?? stability,
                breath: tweak?.breath ?? breath,
                focus: tweak?.focus ?? focus,
                pain: tweak?.pain ?? pain,
            };

            const overallScore = computeOverallScore({ ...m, skipped });

            scData.push({
                sessionId: "to-fill", // replaced after session create
                poseId: pose.id,
                orderInSession: order++,
                segment: seg,
                side,
                skipped,
                notes: maybeNotes,
                ...m,
                overallScore: overallScore ?? undefined,
            });
        };

        if (pose.isTwoSided) {
            mk("RIGHT");
            // small asymmetry noise
            mk("LEFT", {
                ease: clamp(ease + randInt(-1, 1), 1, 10),
                stability: clamp(stability + randInt(-1, 1), 1, 10),
                pain: clamp(pain + randInt(-1, 1), 1, 10),
            });
        } else {
            mk("NA");
        }
    }

    const energyLevel = randNormInt(isGoodDay ? 8 : 6, 1.0);
    const mood = randNormInt(isGoodDay ? 8 : 6, 1.0);
    const durationMinutes = randChoice(BASE_DURATION_MIN);

    // Create within a transaction
    const created = await prisma.$transaction(async (tx) => {
        const session = await tx.practiceSession.create({
            data: {
                userId,
                date: new Date(dayStart.getTime() + 12 * 60 * 60 * 1000), // noon
                label,
                practiceType,
                status: Status.DRAFT, // <-- forced published / draft
                energyLevel,
                mood,
                durationMinutes,
            },
            select: { id: true },
        });

        const toInsert: Prisma.ScoreCardCreateManyInput[] = scData.map((s) => ({
            ...s,
            sessionId: session.id,
        }));

        await tx.scoreCard.createMany({ data: toInsert });

        // compute session overall (avg of non-skipped with overallScore)
        const agg = await tx.scoreCard.aggregate({
            where: { sessionId: session.id, skipped: false, overallScore: { not: null } },
            _avg: { overallScore: true },
        });

        const updated = await tx.practiceSession.update({
            where: { id: session.id },
            data: { overallScore: agg._avg.overallScore ?? undefined },
            include: { scoreCards: { orderBy: { orderInSession: "asc" } } },
        });

        return updated;
    });

    console.log(created.id);

    return created;
}

// --- Main -----------------------------------------------------------------

async function main() {
    const userId = await resolveUserId();
    const catalog = await loadPoseCatalog();

    // sanity checks
    if (!catalog.sun.length || !catalog.standing.length || !catalog.finishing.length) {
        throw new Error("Catalog missing SUN/STANDING/FINISHING poses. Did you seed poses?");
    }
    if (!catalog.primary.length && !catalog.intermediate.length && !catalog.advA.length && !catalog.advB.length) {
        throw new Error("No series poses found (PRIMARY/INTERMEDIATE/ADV_A/ADV_B).");
    }

    const today = startOfDay(new Date());
    const windowStart = new Date(today);
    windowStart.setDate(today.getDate() - (DAYS - 1));

    if (WIPE_WINDOW) {
        const del = await prisma.practiceSession.deleteMany({
            where: { userId, date: { gte: windowStart, lte: endOfDay(today) } },
        });
        console.log(`🧹 Wiped ${del.count} sessions in window`);
    }

    for (let i = DAYS - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);

        const created = await createDay(userId, d, catalog);
        console.log(
            `✅ ${d.toISOString().slice(0, 10)} — ${created.label}  (${created.scoreCards.length} cards, overall=${created.overallScore ?? "n/a"})`
        );
    }
}

main()
    .catch((e) => {
        console.error("❌ Backfill error:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
