import { Prisma } from "@prisma/client";

export const SESSION_VIEW_SELECT = Prisma.validator<Prisma.PracticeSessionSelect>()({
    id: true,
    status: true,
    date: true,
    label: true,
    practiceType: true,
    durationMinutes: true,
    mood: true,
    energyLevel: true,
    notes: true,
    overallScore: true,
    scoreCards: {
        orderBy: { orderInSession: "asc" },
        select: {
            id: true,
            orderInSession: true,
            segment: true,
            side: true,
            scored: true,
            skipped: true,
            overallScore: true,
            ease: true,
            comfort: true,
            stability: true,
            pain: true,
            breath: true,
            focus: true,
            pose: {
                select: {
                    id: true,
                    slug: true,
                    sanskritName: true,
                    englishName: true,
                    sequenceGroup: true,
                    isTwoSided: true,
                },
            },
        },
    },
});

export const SESSION_STATS_SELECT = Prisma.validator<Prisma.PracticeSessionSelect>()({
    id: true,
    status: true,
    date: true,
    label: true,
    practiceType: true,
    durationMinutes: true,
    overallScore: true,
    scoreCards: {
        orderBy: { orderInSession: "asc" },
        select: {
            id: true,
            orderInSession: true,
            segment: true,
            side: true,
            scored: true,
            skipped: true,
            overallScore: true,
            ease: true,
            comfort: true,
            stability: true,
            pain: true,
            breath: true,
            focus: true,
            pose: {
                select: {
                    id: true,
                    slug: true,
                    sanskritName: true,
                    sequenceGroup: true,
                },
            },
        },
    },
});

export const SESSION_LIST_SELECT = Prisma.validator<Prisma.PracticeSessionSelect>()({
    id: true,
    date: true,
    label: true,
    status: true,
    overallScore: true,
    energyLevel: true,
    mood: true,
    practiceType: true,
});

export const SESSION_ID_STATUS_SELECT = Prisma.validator<Prisma.PracticeSessionSelect>()({
    id: true,
    status: true,
});

export const SESSION_UPDATE_SELECT = Prisma.validator<Prisma.PracticeSessionSelect>()({
    id: true,
    status: true,
    date: true,
    label: true,
    practiceType: true,
    durationMinutes: true,
    overallScore: true,
    energyLevel: true,
    mood: true,
    notes: true,
});

export const SESSION_PUBLISH_RESULT_SELECT = Prisma.validator<Prisma.PracticeSessionSelect>()({
    id: true,
    status: true,
    date: true,
    overallScore: true,
});
