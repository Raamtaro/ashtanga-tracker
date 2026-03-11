import { Prisma, PracticeType, SequenceSegment, Side, Status } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { CATALOG, type GroupKey } from "../lib/sequenceDef.js";

const TOTAL_DAYS = 28;
const LABEL_PREFIX = "Dummy4W";

const USER_ID = process.env.USER_ID ?? undefined;
const USER_EMAIL = process.env.USER_EMAIL ?? undefined;

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

type PlanItem = {
    name: string;
    slug: string;
    segment: SequenceSegment;
};

type MetricBundle = {
    ease: number;
    comfort: number;
    stability: number;
    pain: number;
    breath: number;
    focus: number;
};

function slugify(name: string) {
    return name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function clamp(n: number, lo = 1, hi = 10) {
    return Math.max(lo, Math.min(hi, n));
}

function randInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function startOfDay(d: Date) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

function addDays(d: Date, days: number) {
    const x = new Date(d);
    x.setDate(x.getDate() + days);
    return x;
}

function dayTimeForWeekday(weekday: number) {
    const times: Record<number, { hour: number; minute: number }> = {
        2: { hour: 6, minute: 10 },
        3: { hour: 17, minute: 45 },
        4: { hour: 6, minute: 0 },
        5: { hour: 18, minute: 10 },
        6: { hour: 8, minute: 0 },
        0: { hour: 7, minute: 30 },
    };

    return times[weekday] ?? { hour: 6, minute: 30 };
}

function withPracticeTime(day: Date) {
    const d = new Date(day);
    const t = dayTimeForWeekday(day.getDay());
    d.setHours(t.hour, t.minute, 0, 0);
    return d;
}

function namesFromGroup(group: GroupKey): string[] {
    return CATALOG[group].map((p) => p.name);
}

function sunSegmentForPoseName(name: string): SequenceSegment {
    if (/surya\s+namaskar\s+b/i.test(name)) return "SUN_B";
    return "SUN_A";
}

function toPlanItems(group: GroupKey, names: string[]): PlanItem[] {
    return names.map((name) => ({
        name,
        slug: slugify(name),
        segment: group === "SUN" ? sunSegmentForPoseName(name) : SEGMENT_FOR_GROUP[group],
    }));
}

function sliceUpToSlug(names: string[], upToSlug: string): string[] {
    const idx = names.findIndex((n) => slugify(n) === slugify(upToSlug));
    if (idx === -1) throw new Error(`Could not find pose slug '${upToSlug}' in sequence list.`);
    return names.slice(0, idx + 1);
}

function computeOverall(metrics: MetricBundle): number {
    const vals = [metrics.ease, metrics.comfort, metrics.stability, metrics.pain, metrics.breath, metrics.focus];
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return Math.round(avg * 100) / 100;
}

function genericMetricsForWeek(weekIndex: number): MetricBundle {
    const baseByWeek = [5, 6, 7, 8];
    const base = baseByWeek[weekIndex] ?? 6;

    return {
        ease: clamp(base + randInt(-1, 1)),
        comfort: clamp(base + randInt(-1, 1)),
        stability: clamp(base + randInt(-2, 1)),
        pain: clamp(base + randInt(-1, 2)),
        breath: clamp(base + randInt(-1, 1)),
        focus: clamp(base + randInt(-1, 1)),
    };
}

function mayurasanaProfile(weekIndex: number): { metrics: MetricBundle; note: string } {
    if (weekIndex === 0) {
        return {
            metrics: { ease: 4, comfort: 4, stability: 3, pain: 2, breath: 4, focus: 4 },
            note: "Week 1: struggled to balance in Mayurasana and had noticeable wrist pain.",
        };
    }

    if (weekIndex === 1) {
        return {
            metrics: { ease: 6, comfort: 6, stability: 6, pain: 4, breath: 5, focus: 6 },
            note: "Week 2: balance improved, but I lost it while bringing feet together and breath felt unstable.",
        };
    }

    if (weekIndex === 2) {
        return {
            metrics: { ease: 7, comfort: 7, stability: 7, pain: 7, breath: 7, focus: 7 },
            note: "Week 3: improved overall in Mayurasana with steadier control and less discomfort.",
        };
    }

    return {
        metrics: { ease: 9, comfort: 9, stability: 9, pain: 9, breath: 9, focus: 9 },
        note: "Week 4: Mayurasana felt stable and controlled with no notable difficulty.",
    };
}

function resolveWeekdayPlan(day: Date): {
    practiceType: PracticeType;
    label: string;
    middleItems: PlanItem[];
} | null {
    const weekday = day.getDay();

    const primaryNames = namesFromGroup("PRIMARY_ONLY");
    const intermediateNames = namesFromGroup("INTERMEDIATE_ONLY");

    const primaryFull = toPlanItems("PRIMARY_ONLY", primaryNames);
    const primaryHalf = toPlanItems("PRIMARY_ONLY", sliceUpToSlug(primaryNames, "navasana"));
    const intermediateToNakrasana = toPlanItems("INTERMEDIATE_ONLY", sliceUpToSlug(intermediateNames, "nakrasana"));

    if (weekday === 1) {
        return null; // Monday no practice
    }

    if (weekday === 2) {
        return {
            practiceType: PracticeType.INTERMEDIATE,
            label: `${LABEL_PREFIX}: Intermediate to Nakrasana`,
            middleItems: intermediateToNakrasana,
        };
    }

    if (weekday === 3) {
        return {
            practiceType: PracticeType.CUSTOM,
            label: `${LABEL_PREFIX}: Full Primary + Intermediate to Nakrasana`,
            middleItems: [...primaryFull, ...intermediateToNakrasana],
        };
    }

    if (weekday === 4) {
        return {
            practiceType: PracticeType.FULL_PRIMARY,
            label: `${LABEL_PREFIX}: Full Primary`,
            middleItems: primaryFull,
        };
    }

    if (weekday === 5) {
        return {
            practiceType: PracticeType.INTERMEDIATE,
            label: `${LABEL_PREFIX}: Intermediate to Nakrasana`,
            middleItems: intermediateToNakrasana,
        };
    }

    if (weekday === 6) {
        return {
            practiceType: PracticeType.FULL_PRIMARY,
            label: `${LABEL_PREFIX}: Full Primary`,
            middleItems: primaryFull,
        };
    }

    return {
        practiceType: PracticeType.CUSTOM,
        label: `${LABEL_PREFIX}: Half Primary + Intermediate to Nakrasana`,
        middleItems: [...primaryHalf, ...intermediateToNakrasana],
    };
}

async function resolveUserId() {
    if (USER_ID) return USER_ID;

    if (USER_EMAIL) {
        const user = await prisma.user.findUnique({ where: { email: USER_EMAIL }, select: { id: true } });
        if (!user) throw new Error(`No user found for USER_EMAIL=${USER_EMAIL}`);
        return user.id;
    }

    const fallback = await prisma.user.findFirst({ select: { id: true, email: true } });
    if (!fallback) throw new Error("No users found. Create a user first.");

    console.warn(`⚠️ USER_ID/USER_EMAIL not provided; using first user: ${fallback.email ?? fallback.id}`);
    return fallback.id;
}

async function buildPoseMap(planItems: PlanItem[]) {
    const slugs = Array.from(new Set(planItems.map((p) => p.slug)));

    const rows = await prisma.pose.findMany({
        where: { slug: { in: slugs } },
        select: { id: true, slug: true, isTwoSided: true },
    });

    const map = new Map(rows.map((r) => [r.slug, r]));
    const missing = slugs.filter((slug) => !map.has(slug));

    if (missing.length > 0) {
        throw new Error(`Missing poses in DB for slugs: ${missing.join(", ")}. Run pose seed first.`);
    }

    return map;
}

async function createSessionForDay(params: {
    userId: string;
    day: Date;
    windowStart: Date;
}) {
    const { userId, day, windowStart } = params;

    const plan = resolveWeekdayPlan(day);
    if (!plan) return null;

    const planItems: PlanItem[] = [
        ...toPlanItems("SUN", namesFromGroup("SUN")),
        ...toPlanItems("STANDING", namesFromGroup("STANDING")),
        ...plan.middleItems,
        ...toPlanItems("BACKBENDING", namesFromGroup("BACKBENDING")),
        ...toPlanItems("FINISHING", namesFromGroup("FINISHING")),
    ];

    const poseMap = await buildPoseMap(planItems);

    const weekIndex = Math.min(3, Math.floor((startOfDay(day).getTime() - windowStart.getTime()) / (7 * 24 * 60 * 60 * 1000)));

    const scoreCardRows: Prisma.ScoreCardCreateManyInput[] = [];
    let order = 1;

    for (const item of planItems) {
        const pose = poseMap.get(item.slug)!;

        const defaultMetrics = genericMetricsForWeek(weekIndex);

        const makeRow = (side: Side, metrics: MetricBundle, note?: string) => {
            scoreCardRows.push({
                sessionId: "pending",
                poseId: pose.id,
                orderInSession: order++,
                segment: item.segment,
                side,
                skipped: false,
                ...metrics,
                overallScore: computeOverall(metrics),
                notes: note,
            });
        };

        const isMayurasana = item.slug === "mayurasana";
        const mayurasana = isMayurasana ? mayurasanaProfile(weekIndex) : null;

        if (pose.isTwoSided) {
            makeRow(
                Side.RIGHT,
                isMayurasana ? mayurasana!.metrics : defaultMetrics,
                isMayurasana ? mayurasana!.note : undefined,
            );

            const leftTweaked: MetricBundle = {
                ease: clamp((isMayurasana ? mayurasana!.metrics.ease : defaultMetrics.ease) + randInt(-1, 1)),
                comfort: clamp((isMayurasana ? mayurasana!.metrics.comfort : defaultMetrics.comfort) + randInt(-1, 1)),
                stability: clamp((isMayurasana ? mayurasana!.metrics.stability : defaultMetrics.stability) + randInt(-1, 1)),
                pain: clamp((isMayurasana ? mayurasana!.metrics.pain : defaultMetrics.pain) + randInt(-1, 1)),
                breath: clamp((isMayurasana ? mayurasana!.metrics.breath : defaultMetrics.breath) + randInt(-1, 1)),
                focus: clamp((isMayurasana ? mayurasana!.metrics.focus : defaultMetrics.focus) + randInt(-1, 1)),
            };

            makeRow(
                Side.LEFT,
                leftTweaked,
                isMayurasana ? mayurasana!.note : undefined,
            );
        } else {
            makeRow(
                Side.NA,
                isMayurasana ? mayurasana!.metrics : defaultMetrics,
                isMayurasana ? mayurasana!.note : undefined,
            );
        }
    }

    const created = await prisma.$transaction(async (tx) => {
        const session = await tx.practiceSession.create({
            data: {
                userId,
                date: withPracticeTime(day),
                label: plan.label,
                practiceType: plan.practiceType,
                status: Status.PUBLISHED,
                durationMinutes: 85 + randInt(-10, 20),
                notes: `${LABEL_PREFIX} Week ${weekIndex + 1}: ${plan.label}`,
                energyLevel: clamp(6 + weekIndex + randInt(-1, 1), 1, 10),
                mood: clamp(6 + weekIndex + randInt(-1, 1), 1, 10),
            },
            select: { id: true, date: true, label: true },
        });

        const rows = scoreCardRows.map((row) => ({ ...row, sessionId: session.id }));
        await tx.scoreCard.createMany({ data: rows });

        const agg = await tx.scoreCard.aggregate({
            where: { sessionId: session.id, skipped: false, overallScore: { not: null } },
            _avg: { overallScore: true },
        });

        const updated = await tx.practiceSession.update({
            where: { id: session.id },
            data: { overallScore: agg._avg.overallScore ?? null },
            select: { id: true, date: true, label: true, overallScore: true },
        });

        return updated;
    });

    return created;
}

async function main() {
    const userId = await resolveUserId();

    const today = startOfDay(new Date());
    const windowStart = addDays(today, -(TOTAL_DAYS - 1));
    const deleted = await prisma.practiceSession.deleteMany({
        where: { userId },
    });

    console.log(`🧹 Removed ${deleted.count} existing sessions for user before backfill`);

    let createdCount = 0;

    for (let offset = 0; offset < TOTAL_DAYS; offset++) {
        const day = addDays(windowStart, offset);
        const created = await createSessionForDay({ userId, day, windowStart });

        if (!created) {
            console.log(`⏭️ ${day.toISOString().slice(0, 10)} Monday rest day`);
            continue;
        }

        createdCount += 1;
        console.log(`✅ ${created.date.toISOString().slice(0, 10)} ${created.label} (overall=${created.overallScore ?? "n/a"})`);
    }

    console.log(`\nDone. Created ${createdCount} sessions across the past 4 weeks (Mondays skipped).`);
    console.log("Mayurasana trend notes were injected by week 1->4 in intermediate-containing sessions.");
}

main()
    .catch((err) => {
        console.error("❌ Backfill 4 weeks failed:", err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
