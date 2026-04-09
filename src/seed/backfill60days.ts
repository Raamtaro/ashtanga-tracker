import { PracticeType, Prisma } from "@prisma/client";

import prisma from "../lib/prisma.js";
import {
    buildSessionWithScoreCards,
    resolveCandidates,
} from "../routes/controllers/session/createV3.service.js";
import {
    type PresetPracticeType,
    type SequenceSnippet,
} from "../routes/controllers/session/createV3.schemas.js";

const SCRIPT_TAG = "[seed-backfill-60d-v1]";
const DEFAULT_DAYS = 60;

const TRACKED_SCORE_SLUGS = [
    "janu-sirsasana-c",
    "marichyasana-d",
    "kapotasana-a",
    "eka-pada-sirsasana",
    "dwi-pada-sirsasana",
    "karandavasana",
    "drop-backs",
    "viparita-chakrasana",
] as const;

const ALWAYS_SKIPPED_SLUGS = [
    "taraksvasana",
    "tirieng-mukha-uttanasana",
] as const;

type ModePlan =
    | {
        mode: "preset";
        practiceType: PresetPracticeType;
        label: string;
        durationMin: number;
        durationMax: number;
    }
    | {
        mode: "custom";
        practiceType: PracticeType;
        sequenceSnippets: SequenceSnippet[];
        label: string;
        durationMin: number;
        durationMax: number;
    };

type DayPlan = {
    date: Date;
    weekday: number;
    modePlan: ModePlan;
};

function getArg(flag: string): string | undefined {
    const idx = process.argv.indexOf(flag);
    if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
    return undefined;
}

function hasFlag(flag: string): boolean {
    return process.argv.includes(flag);
}

function clampInt(value: number, min = 1, max = 10) {
    return Math.max(min, Math.min(max, Math.round(value)));
}

function clampFloat(value: number, min = 1, max = 10) {
    return Math.max(min, Math.min(max, value));
}

function round1(value: number) {
    return Math.round(value * 10) / 10;
}

function randomInRange(min: number, max: number) {
    return min + (Math.random() * (max - min));
}

function jitter(maxAbs = 0.75) {
    return randomInRange(-maxAbs, maxAbs);
}

function startOfLocalDay(date: Date) {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
}

function addDays(date: Date, days: number) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
}

function randomSessionClockForWeekday(weekday: number) {
    const baseHour = weekday === 0 || weekday === 6 ? 8 : 6;
    const minute = Math.floor(randomInRange(0, 50));
    const extraHour = Math.floor(randomInRange(0, 2));
    return { hour: baseHour + extraHour, minute };
}

function withSessionTime(day: Date, weekday: number) {
    const out = new Date(day);
    const clock = randomSessionClockForWeekday(weekday);
    out.setHours(clock.hour, clock.minute, 0, 0);
    return out;
}

function weekdayToPlan(weekday: number): ModePlan | null {
    switch (weekday) {
        case 1:
            return null; // Monday = day off
        case 2:
            return {
                mode: "custom",
                practiceType: PracticeType.CUSTOM,
                sequenceSnippets: [{ group: "INTERMEDIATE", upToSlug: "vatayanasana" }],
                label: "Intermediate to Vatayanasana",
                durationMin: 95,
                durationMax: 115,
            };
        case 3:
            return {
                mode: "custom",
                practiceType: PracticeType.CUSTOM,
                sequenceSnippets: [
                    { group: "PRIMARY", upToSlug: "navasana" },
                    { group: "INTERMEDIATE", upToSlug: "vatayanasana" },
                ],
                label: "Half Primary + Intermediate to Vatayanasana",
                durationMin: 120,
                durationMax: 145,
            };
        case 4:
            return {
                mode: "preset",
                practiceType: PracticeType.FULL_PRIMARY,
                label: "Full Primary",
                durationMin: 100,
                durationMax: 120,
            };
        case 5:
            return {
                mode: "custom",
                practiceType: PracticeType.CUSTOM,
                sequenceSnippets: [{ group: "INTERMEDIATE", upToSlug: "vatayanasana" }],
                label: "Intermediate to Vatayanasana",
                durationMin: 95,
                durationMax: 115,
            };
        case 6:
            return {
                mode: "preset",
                practiceType: PracticeType.FULL_PRIMARY,
                label: "Full Primary",
                durationMin: 100,
                durationMax: 120,
            };
        case 0:
            return {
                mode: "custom",
                practiceType: PracticeType.CUSTOM,
                sequenceSnippets: [
                    { group: "PRIMARY", upToSlug: "navasana" },
                    { group: "INTERMEDIATE", upToSlug: "vatayanasana" },
                ],
                label: "Half Primary + Intermediate to Vatayanasana",
                durationMin: 120,
                durationMax: 145,
            };
        default:
            return null;
    }
}

function buildDayPlans(days: number): DayPlan[] {
    const today = startOfLocalDay(new Date());
    const plans: DayPlan[] = [];

    for (let offset = days - 1; offset >= 0; offset -= 1) {
        const day = addDays(today, -offset);
        const weekday = day.getDay();
        const modePlan = weekdayToPlan(weekday);
        if (!modePlan) continue;

        plans.push({
            date: withSessionTime(day, weekday),
            weekday,
            modePlan,
        });
    }

    return plans;
}

function scoreTemplate(
    slug: string,
    side: string | null,
    weekday: number,
    normalizedProgress: number,
) {
    let baseOverall = 8.0;
    let basePain = 8.0;
    let note: string | null = null;

    switch (slug) {
        case "janu-sirsasana-c": {
            if (side === "LEFT") {
                baseOverall = 8.2 - (2.7 * normalizedProgress);
                basePain = 8.2 - (3.8 * normalizedProgress);
                if (normalizedProgress > 0.7) {
                    note = "Left side felt tighter with sharper hamstring sensation today.";
                }
            } else {
                baseOverall = 8.5 + jitter(0.2);
                basePain = 8.7 + jitter(0.2);
            }
            break;
        }
        case "marichyasana-d": {
            if (side === "RIGHT") {
                baseOverall = 8.1 - (1.0 * normalizedProgress);
                basePain = 8.0 - (0.8 * normalizedProgress);
            } else {
                baseOverall = 8.6 + jitter(0.15);
                basePain = 8.4 + jitter(0.2);
            }
            break;
        }
        case "kapotasana-a": {
            baseOverall = 8.5;
            basePain = 8.3;
            if (weekday === 3) {
                note = "Heel caught cleanly after steady setup on both sides.";
            }
            if (weekday === 5) {
                baseOverall -= 1.1;
                basePain -= 1.0;
                note = "Heel was not grabbable today, stayed with prep and breath control.";
            }
            break;
        }
        case "eka-pada-sirsasana": {
            baseOverall = 8.3;
            basePain = 8.0;
            if (weekday === 5) {
                baseOverall -= 1.2;
                basePain -= 1.0;
                note = "Needed extra prep before placing the leg behind the head.";
            }
            break;
        }
        case "dwi-pada-sirsasana": {
            baseOverall = 8.1;
            basePain = 7.9;
            if (weekday === 5) {
                baseOverall -= 1.2;
                basePain -= 1.1;
                note = "Compression and neck load felt heavier than usual today.";
            }
            break;
        }
        case "karandavasana": {
            baseOverall = 7.8 + (0.3 * normalizedProgress);
            basePain = 7.8 + (0.2 * normalizedProgress);
            if (weekday === 0) {
                baseOverall -= 1.3;
                basePain -= 1.1;
                note = "Control in descent was inconsistent on Sunday practice.";
            }
            break;
        }
        case "drop-backs": {
            baseOverall = 8.5 + (0.2 * normalizedProgress);
            basePain = 8.6;
            break;
        }
        case "viparita-chakrasana": {
            baseOverall = 6.3 + (1.6 * normalizedProgress) + jitter(1.1);
            basePain = 6.5 + (1.4 * normalizedProgress) + jitter(1.1);
            break;
        }
        default:
            break;
    }

    const ease = clampInt(baseOverall + jitter(1.0));
    const comfort = clampInt(baseOverall + jitter(1.0));
    const stability = clampInt(baseOverall + jitter(1.2));
    const pain = clampInt(basePain + jitter(1.0));
    const breath = clampInt(baseOverall + jitter(0.9));
    const focus = clampInt(baseOverall + jitter(0.9));

    const overallScore = round1(clampFloat(
        ((ease + comfort + stability + pain + breath + focus) / 6) + jitter(0.35),
    ));

    return {
        ease,
        comfort,
        stability,
        pain,
        breath,
        focus,
        overallScore,
        notes: note,
    };
}

function toIsoDate(date: Date) {
    return date.toISOString().slice(0, 10);
}

function sessionNote(label: string, weekday: number) {
    const weekdaySummary = {
        0: "Sunday mixed practice",
        2: "Tuesday intermediate focus",
        3: "Wednesday mixed practice",
        4: "Thursday primary focus",
        5: "Friday intermediate focus",
        6: "Saturday primary focus",
    }[weekday] ?? "Practice session";

    return `${label} - ${weekdaySummary}. ${SCRIPT_TAG}`;
}

function randomDuration(min: number, max: number) {
    return Math.round(randomInRange(min, max));
}

function randomSessionEnergy(weekday: number) {
    const base = weekday === 5 ? 6.5 : 7.6;
    return clampInt(base + jitter(1.2));
}

function randomSessionMood(weekday: number) {
    const base = weekday === 5 ? 7.0 : 8.0;
    return clampInt(base + jitter(1.0));
}

async function resolveUserId(): Promise<string> {
    const userId = getArg("--user") ?? process.env.USER_ID;
    const email = getArg("--email") ?? process.env.USER_EMAIL;

    if (userId) {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!user) throw new Error(`User not found for id: ${userId}`);
        return user.id;
    }

    if (email) {
        const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
        if (!user) throw new Error(`User not found for email: ${email}`);
        return user.id;
    }

    throw new Error("Provide --user <id> (or USER_ID) or --email <email> (or USER_EMAIL)");
}

async function deletePreviousSeededSessionsInWindow(userId: string, from: Date, to: Date) {
    const where: Prisma.PracticeSessionWhereInput = {
        userId,
        date: { gte: from, lt: to },
        notes: { contains: SCRIPT_TAG },
    };

    const count = await prisma.practiceSession.count({ where });
    if (count === 0) {
        console.log("No previously seeded sessions found in range.");
        return;
    }

    const result = await prisma.practiceSession.deleteMany({ where });
    console.log(`Deleted ${result.count} previously seeded sessions in range.`);
}

async function seedOneSession(params: {
    userId: string;
    dayPlan: DayPlan;
    index: number;
    total: number;
}) {
    const { userId, dayPlan, index, total } = params;
    const progress = total <= 1 ? 1 : (index / (total - 1));

    await prisma.$transaction(async (tx) => {
        const candidateInput = dayPlan.modePlan.mode === "preset"
            ? {
                mode: "preset" as const,
                practiceType: dayPlan.modePlan.practiceType,
            }
            : {
                mode: "custom" as const,
                practiceType: PracticeType.CUSTOM,
                sequenceSnippets: dayPlan.modePlan.sequenceSnippets,
            };

        const resolved = await resolveCandidates(tx, candidateInput);
        const scoredPoses = TRACKED_SCORE_SLUGS.filter((slug) => resolved.validSlugs.includes(slug));

        const session = await buildSessionWithScoreCards({
            tx,
            userId,
            date: dayPlan.date,
            label: dayPlan.modePlan.label,
            notes: sessionNote(dayPlan.modePlan.label, dayPlan.weekday),
            duration: randomDuration(dayPlan.modePlan.durationMin, dayPlan.modePlan.durationMax),
            practiceType: resolved.practiceType,
            energyLevel: randomSessionEnergy(dayPlan.weekday),
            mood: randomSessionMood(dayPlan.weekday),
            candidateCards: resolved.candidateCards,
            scoredPoses,
        });

        if (!session) {
            throw new Error("Session creation failed unexpectedly");
        }

        await tx.scoreCard.updateMany({
            where: {
                sessionId: session.id,
                pose: { slug: { in: [...ALWAYS_SKIPPED_SLUGS] } },
            },
            data: {
                skipped: true,
                scored: false,
            },
        });

        const scoredCards = await tx.scoreCard.findMany({
            where: {
                sessionId: session.id,
                scored: true,
                skipped: false,
            },
            select: {
                id: true,
                side: true,
                pose: { select: { slug: true } },
            },
        });

        for (const card of scoredCards) {
            const metrics = scoreTemplate(card.pose.slug, card.side, dayPlan.weekday, progress);
            await tx.scoreCard.update({
                where: { id: card.id },
                data: {
                    ease: metrics.ease,
                    comfort: metrics.comfort,
                    stability: metrics.stability,
                    pain: metrics.pain,
                    breath: metrics.breath,
                    focus: metrics.focus,
                    overallScore: metrics.overallScore,
                    notes: metrics.notes,
                },
            });
        }

        const avg = await tx.scoreCard.aggregate({
            where: {
                sessionId: session.id,
                scored: true,
                skipped: false,
                overallScore: { not: null },
            },
            _avg: {
                overallScore: true,
            },
        });

        await tx.practiceSession.update({
            where: { id: session.id },
            data: {
                overallScore: avg._avg.overallScore ? round1(avg._avg.overallScore) : null,
                status: "PUBLISHED",
            },
        });
    });

    console.log(`Seeded ${toIsoDate(dayPlan.date)} - ${dayPlan.modePlan.label}`);
}

async function main() {
    const days = Number(getArg("--days") ?? DEFAULT_DAYS);
    if (!Number.isFinite(days) || days < 1 || days > 365) {
        throw new Error("--days must be a number between 1 and 365");
    }

    const replace = hasFlag("--replace");
    const yes = hasFlag("--yes") || process.env.CONFIRM === "1";

    if (replace && !yes) {
        throw new Error("Refusing to delete seeded sessions without --yes (or CONFIRM=1)");
    }

    const userId = await resolveUserId();
    const dayPlans = buildDayPlans(days);

    if (dayPlans.length === 0) {
        console.log("No practice days found in selected window.");
        return;
    }

    const rangeStart = startOfLocalDay(dayPlans[0].date);
    const rangeEnd = addDays(startOfLocalDay(dayPlans[dayPlans.length - 1].date), 1);

    console.log(`User: ${userId}`);
    console.log(`Window: ${toIsoDate(rangeStart)} -> ${toIsoDate(addDays(rangeEnd, -1))}`);
    console.log(`Days requested: ${days}; sessions to seed (Mondays off): ${dayPlans.length}`);

    if (replace) {
        await deletePreviousSeededSessionsInWindow(userId, rangeStart, rangeEnd);
    }

    for (let i = 0; i < dayPlans.length; i += 1) {
        await seedOneSession({
            userId,
            dayPlan: dayPlans[i],
            index: i,
            total: dayPlans.length,
        });
    }

    console.log(`Done. Seeded ${dayPlans.length} sessions with scored workflow + trend-aware card data.`);
}

main()
    .catch((error) => {
        console.error("Backfill 60-day seed failed:", error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
