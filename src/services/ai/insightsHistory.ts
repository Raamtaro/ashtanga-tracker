import { Prisma } from "@prisma/client";
import { z } from "zod";

import prisma from "../../lib/prisma.js";
import { HttpError } from "./shared.js";

const INSIGHT_TYPES = ["weekly", "pose"] as const;
type InsightType = (typeof INSIGHT_TYPES)[number];

const insightTypeRank: Record<InsightType, number> = {
    weekly: 1,
    pose: 0,
};

const cursorSchema = z.object({
    createdAt: z.string().datetime(),
    type: z.enum(INSIGHT_TYPES),
    id: z.string().min(1),
});

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const insightsHistoryQuerySchema = z.object({
    type: z.enum(INSIGHT_TYPES).optional(),
    limit: z.coerce.number().int().positive().max(100).default(20),
    cursor: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    poseId: z.string().min(1).optional(),
    timeZone: z.string().default("UTC"),
    includeDebug: z.coerce.boolean().default(false),
}).superRefine((input, ctx) => {
    if (input.poseId && input.type === "weekly") {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["poseId"],
            message: "poseId is only supported when type is pose or omitted",
        });
    }

    if (input.from && !isValidDateQueryInput(input.from)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["from"],
            message: "from must be a valid ISO datetime or YYYY-MM-DD date",
        });
    }

    if (input.to && !isValidDateQueryInput(input.to)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["to"],
            message: "to must be a valid ISO datetime or YYYY-MM-DD date",
        });
    }

    if (!isValidTimeZone(input.timeZone)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["timeZone"],
            message: "Invalid IANA time zone",
        });
    }
});

export const insightDetailParamsSchema = z.object({
    type: z.enum(INSIGHT_TYPES),
    id: z.string().min(1),
});

export const insightDetailQuerySchema = z.object({
    includeDebug: z.coerce.boolean().default(false),
});

type InsightsHistoryQuery = z.infer<typeof insightsHistoryQuerySchema>;
type InsightDetailParams = z.infer<typeof insightDetailParamsSchema>;
type InsightDetailQuery = z.infer<typeof insightDetailQuerySchema>;
type CursorPayload = z.infer<typeof cursorSchema>;

type InsightDebugFields = {
    computed: Prisma.JsonValue | null;
    llmInput: Prisma.JsonValue | null;
};

type PoseHistoryItem = {
    id: string;
    createdAt: string;
    type: "pose";
    pose: {
        id: string;
        slug: string;
        sanskritName: string;
        englishName: string | null;
    };
    timeframe: {
        start: string;
        endExclusive: string;
        totalDays: number;
    };
    ai: {
        summary: string | null;
    };
    meta: {
        source: "stored";
        insightId: string;
        createdAt: string;
        model: string | null;
        debugIncluded: boolean;
    };
} & Partial<InsightDebugFields>;

type WeeklyHistoryItem = {
    id: string;
    createdAt: string;
    type: "weekly";
    window: {
        currentWeek: {
            start: string;
            endExclusive: string;
        };
        previousWeek: {
            start: string;
            endExclusive: string;
        };
    };
    ai: {
        summary: string | null;
    };
    meta: {
        source: "stored";
        insightId: string;
        createdAt: string;
        model: string | null;
        debugIncluded: boolean;
        requestConfig: {
            weekStartsOn: string;
            timeZone: string;
            includeDrafts: boolean;
        };
    };
} & Partial<InsightDebugFields>;

type InsightHistoryItem = PoseHistoryItem | WeeklyHistoryItem;

function encodeCursor(payload: CursorPayload) {
    return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeCursor(rawCursor: string | undefined): CursorPayload | undefined {
    if (!rawCursor) return undefined;

    try {
        const decoded = JSON.parse(
            Buffer.from(rawCursor, "base64url").toString("utf8"),
        );
        return cursorSchema.parse(decoded);
    } catch {
        throw new HttpError(400, "Invalid cursor");
    }
}

function addDays(date: Date, days: number) {
    return new Date(date.getTime() + (days * 24 * 60 * 60 * 1000));
}

function isValidDateQueryInput(value: string) {
    if (DATE_ONLY_PATTERN.test(value)) return true;
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime());
}

function isValidTimeZone(timeZone: string) {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
        return true;
    } catch {
        return false;
    }
}

function assertValidTimeZone(timeZone: string) {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    } catch {
        throw new HttpError(400, "Invalid timeZone");
    }
}

function getTimeZoneParts(date: Date, timeZone: string) {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });

    const map = new Map(
        formatter
            .formatToParts(date)
            .filter((part) => part.type !== "literal")
            .map((part) => [part.type, part.value]),
    );

    return {
        year: Number(map.get("year")),
        month: Number(map.get("month")),
        day: Number(map.get("day")),
        hour: Number(map.get("hour")),
        minute: Number(map.get("minute")),
        second: Number(map.get("second")),
    };
}

function zonedDateTimeToUtc(
    input: { year: number; month: number; day: number; hour: number; minute: number; second: number },
    timeZone: string,
) {
    const utcGuess = Date.UTC(
        input.year,
        input.month - 1,
        input.day,
        input.hour,
        input.minute,
        input.second,
    );

    const tzParts = getTimeZoneParts(new Date(utcGuess), timeZone);
    const asUtcMs = Date.UTC(
        tzParts.year,
        tzParts.month - 1,
        tzParts.day,
        tzParts.hour,
        tzParts.minute,
        tzParts.second,
    );

    const offsetMs = asUtcMs - utcGuess;
    return new Date(utcGuess - offsetMs);
}

function nextDayYmd(year: number, month: number, day: number) {
    const utc = new Date(Date.UTC(year, month - 1, day));
    utc.setUTCDate(utc.getUTCDate() + 1);

    return {
        year: utc.getUTCFullYear(),
        month: utc.getUTCMonth() + 1,
        day: utc.getUTCDate(),
    };
}

function parseDateBoundary(
    raw: string,
    boundary: "from" | "to",
    timeZone: string,
): { date: Date; isExclusiveUpperBound: boolean } {
    if (DATE_ONLY_PATTERN.test(raw)) {
        const [yearRaw, monthRaw, dayRaw] = raw.split("-");
        const year = Number(yearRaw);
        const month = Number(monthRaw);
        const day = Number(dayRaw);

        if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
            throw new HttpError(400, `Invalid ${boundary} date`);
        }

        if (boundary === "to") {
            const next = nextDayYmd(year, month, day);
            return {
                date: zonedDateTimeToUtc(
                    { year: next.year, month: next.month, day: next.day, hour: 0, minute: 0, second: 0 },
                    timeZone,
                ),
                isExclusiveUpperBound: true,
            };
        }

        return {
            date: zonedDateTimeToUtc(
                { year, month, day, hour: 0, minute: 0, second: 0 },
                timeZone,
            ),
            isExclusiveUpperBound: false,
        };
    }

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
        throw new HttpError(400, `Invalid ${boundary} date`);
    }

    return { date, isExclusiveUpperBound: false };
}

function toDateTimeFilter(from: string | undefined, to: string | undefined, timeZone: string): Prisma.DateTimeFilter | undefined {
    const filter: Prisma.DateTimeFilter = {};
    let fromDate: Date | undefined;
    let toDate: Date | undefined;
    let toIsExclusive = false;

    if (from) {
        const parsedFrom = parseDateBoundary(from, "from", timeZone);
        fromDate = parsedFrom.date;
        filter.gte = parsedFrom.date;
    }

    if (to) {
        const parsedTo = parseDateBoundary(to, "to", timeZone);
        toDate = parsedTo.date;
        toIsExclusive = parsedTo.isExclusiveUpperBound;

        if (toIsExclusive) filter.lt = parsedTo.date;
        else filter.lte = parsedTo.date;
    }

    if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
        throw new HttpError(400, "from must be on or before to");
    }

    return Object.keys(filter).length > 0 ? filter : undefined;
}

function buildCursorFilter(
    type: InsightType,
    cursor: CursorPayload | undefined,
): Prisma.PoseInsightWhereInput | Prisma.WeeklyInsightWhereInput | undefined {
    if (!cursor) return undefined;

    const cursorDate = new Date(cursor.createdAt);
    const typeRank = insightTypeRank[type];
    const cursorTypeRank = insightTypeRank[cursor.type];

    if (typeRank > cursorTypeRank) {
        return {
            createdAt: { lt: cursorDate },
        };
    }

    if (typeRank < cursorTypeRank) {
        return {
            OR: [
                { createdAt: { lt: cursorDate } },
                { createdAt: cursorDate },
            ],
        };
    }

    return {
        OR: [
            { createdAt: { lt: cursorDate } },
            {
                AND: [
                    { createdAt: cursorDate },
                    { id: { lt: cursor.id } },
                ],
            },
        ],
    };
}

function extractSummaryPreview(ai: Prisma.JsonValue) {
    if (!ai || typeof ai !== "object" || Array.isArray(ai)) return null;
    const summary = (ai as Record<string, unknown>).summary;
    if (typeof summary !== "string") return null;
    const normalized = summary.trim();
    if (!normalized.length) return null;
    if (normalized.length <= 220) return normalized;
    return `${normalized.slice(0, 217)}...`;
}

function compareHistoryItemsDesc(a: InsightHistoryItem, b: InsightHistoryItem) {
    const dateDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (dateDiff !== 0) return dateDiff;

    const rankDiff = insightTypeRank[b.type] - insightTypeRank[a.type];
    if (rankDiff !== 0) return rankDiff;

    if (b.id === a.id) return 0;
    return b.id > a.id ? 1 : -1;
}

function mapPoseInsightRow(row: {
    id: string;
    createdAt: Date;
    timeframeStart: Date;
    timeframeEndExclusive: Date;
    totalDays: number;
    timeZone: string;
    ai: Prisma.JsonValue;
    pose: {
        id: string;
        slug: string;
        sanskritName: string;
        englishName: string | null;
    };
    model: string | null;
    computed: Prisma.JsonValue | null;
    llmInput: Prisma.JsonValue | null;
}, includeDebug: boolean): InsightHistoryItem {
    return {
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        type: "pose",
        pose: row.pose,
        timeframe: {
            start: row.timeframeStart.toISOString(),
            endExclusive: row.timeframeEndExclusive.toISOString(),
            totalDays: row.totalDays,
        },
        ai: {
            summary: extractSummaryPreview(row.ai),
        },
        meta: {
            source: "stored",
            insightId: row.id,
            createdAt: row.createdAt.toISOString(),
            model: row.model,
            debugIncluded: includeDebug,
        },
        ...(includeDebug
            ? {
                computed: row.computed,
                llmInput: row.llmInput,
            }
            : {}),
    };
}

function mapWeeklyInsightRow(row: {
    id: string;
    createdAt: Date;
    weekStart: Date;
    weekEndExclusive: Date;
    weekStartsOn: string;
    timeZone: string;
    includeDrafts: boolean;
    ai: Prisma.JsonValue;
    model: string | null;
    computed: Prisma.JsonValue | null;
    llmInput: Prisma.JsonValue | null;
}, includeDebug: boolean): InsightHistoryItem {
    const previousWeekStart = addDays(row.weekStart, -7);

    return {
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        type: "weekly",
        window: {
            currentWeek: {
                start: row.weekStart.toISOString(),
                endExclusive: row.weekEndExclusive.toISOString(),
            },
            previousWeek: {
                start: previousWeekStart.toISOString(),
                endExclusive: row.weekStart.toISOString(),
            },
        },
        ai: {
            summary: extractSummaryPreview(row.ai),
        },
        meta: {
            source: "stored",
            insightId: row.id,
            createdAt: row.createdAt.toISOString(),
            model: row.model,
            debugIncluded: includeDebug,
            requestConfig: {
                weekStartsOn: row.weekStartsOn,
                timeZone: row.timeZone,
                includeDrafts: row.includeDrafts,
            },
        },
        ...(includeDebug
            ? {
                computed: row.computed,
                llmInput: row.llmInput,
            }
            : {}),
    };
}

export async function getInsightsHistoryResponse(userId: string, query: InsightsHistoryQuery) {
    const cursor = decodeCursor(query.cursor);
    assertValidTimeZone(query.timeZone);
    const createdAtFilter = toDateTimeFilter(query.from, query.to, query.timeZone);
    const take = query.limit + 1;

    const shouldFetchPose = query.type !== "weekly";
    const shouldFetchWeekly = query.type !== "pose";

    const poseWhere: Prisma.PoseInsightWhereInput = {
        AND: [
            { userId },
            ...(query.poseId ? [{ poseId: query.poseId }] : []),
            ...(createdAtFilter ? [{ createdAt: createdAtFilter }] : []),
            ...(shouldFetchPose
                ? [{
                    ...(buildCursorFilter("pose", cursor) as Prisma.PoseInsightWhereInput | undefined),
                }]
                : []),
        ],
    };

    const weeklyWhere: Prisma.WeeklyInsightWhereInput = {
        AND: [
            { userId },
            ...(createdAtFilter ? [{ createdAt: createdAtFilter }] : []),
            ...(shouldFetchWeekly
                ? [{
                    ...(buildCursorFilter("weekly", cursor) as Prisma.WeeklyInsightWhereInput | undefined),
                }]
                : []),
        ],
    };

    const [poseRows, weeklyRows] = await Promise.all([
        shouldFetchPose
            ? prisma.poseInsight.findMany({
                where: poseWhere,
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take,
                select: {
                    id: true,
                    createdAt: true,
                    timeframeStart: true,
                    timeframeEndExclusive: true,
                    totalDays: true,
                    timeZone: true,
                    model: true,
                    computed: true,
                    llmInput: true,
                    ai: true,
                    pose: {
                        select: {
                            id: true,
                            slug: true,
                            sanskritName: true,
                            englishName: true,
                        },
                    },
                },
            })
            : Promise.resolve([]),
        shouldFetchWeekly
            ? prisma.weeklyInsight.findMany({
                where: weeklyWhere,
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take,
                select: {
                    id: true,
                    createdAt: true,
                    weekStart: true,
                    weekEndExclusive: true,
                    weekStartsOn: true,
                    timeZone: true,
                    includeDrafts: true,
                    model: true,
                    computed: true,
                    llmInput: true,
                    ai: true,
                },
            })
            : Promise.resolve([]),
    ]);

    const combined = [
        ...poseRows.map((row) => mapPoseInsightRow(row, query.includeDebug)),
        ...weeklyRows.map((row) => mapWeeklyInsightRow(row, query.includeDebug)),
    ].sort(compareHistoryItemsDesc);

    const data = combined.slice(0, query.limit);
    const hasMore = combined.length > query.limit;
    const lastItem = data[data.length - 1];
    const nextCursor = hasMore && lastItem
        ? encodeCursor({
            createdAt: lastItem.createdAt,
            type: lastItem.type,
            id: lastItem.id,
        })
        : null;

    return {
        data,
        page: {
            limit: query.limit,
            hasMore,
            nextCursor,
        },
        filters: {
            type: query.type ?? null,
            poseId: query.poseId ?? null,
            from: query.from ?? null,
            to: query.to ?? null,
            timeZone: query.timeZone,
            includeDebug: query.includeDebug,
        },
    };
}

function extractGenerationContext(llmInput: Prisma.JsonValue) {
    if (!llmInput || typeof llmInput !== "object" || Array.isArray(llmInput)) return null;
    const context = (llmInput as Record<string, unknown>).context;
    if (!context || typeof context !== "object" || Array.isArray(context)) return null;
    return context;
}

export async function getInsightDetailResponse(
    userId: string,
    params: InsightDetailParams,
    query: InsightDetailQuery,
) {
    if (params.type === "pose") {
        const insight = await prisma.poseInsight.findFirst({
            where: {
                id: params.id,
                userId,
            },
            select: {
                id: true,
                createdAt: true,
                updatedAt: true,
                model: true,
                timeframeStart: true,
                timeframeEndExclusive: true,
                totalDays: true,
                timeZone: true,
                computed: true,
                llmInput: true,
                ai: true,
                pose: {
                    select: {
                        id: true,
                        slug: true,
                        sanskritName: true,
                        englishName: true,
                    },
                },
            },
        });

        if (!insight) throw new HttpError(404, "Insight not found");

        return {
            pose: insight.pose,
            timeframe: {
                start: insight.timeframeStart.toISOString(),
                endExclusive: insight.timeframeEndExclusive.toISOString(),
                totalDays: insight.totalDays,
            },
            ai: insight.ai,
            meta: {
                source: "stored",
                insightId: insight.id,
                createdAt: insight.createdAt.toISOString(),
                updatedAt: insight.updatedAt.toISOString(),
                model: insight.model,
                timeZone: insight.timeZone,
                summaryPreview: extractSummaryPreview(insight.ai),
                debugIncluded: query.includeDebug,
                ...(query.includeDebug
                    ? { generationContext: extractGenerationContext(insight.llmInput) }
                    : {}),
            },
            ...(query.includeDebug
                ? {
                    computed: insight.computed,
                    llmInput: insight.llmInput,
                }
                : {}),
        };
    }

    const insight = await prisma.weeklyInsight.findFirst({
        where: {
            id: params.id,
            userId,
        },
        select: {
            id: true,
            createdAt: true,
            updatedAt: true,
            model: true,
            weekStart: true,
            weekEndExclusive: true,
            weekStartsOn: true,
            timeZone: true,
            includeDrafts: true,
            computed: true,
            llmInput: true,
            ai: true,
        },
    });

    if (!insight) throw new HttpError(404, "Insight not found");

    return {
        window: {
            currentWeek: {
                start: insight.weekStart.toISOString(),
                endExclusive: insight.weekEndExclusive.toISOString(),
            },
            previousWeek: {
                start: addDays(insight.weekStart, -7).toISOString(),
                endExclusive: insight.weekStart.toISOString(),
            },
        },
        ai: insight.ai,
        meta: {
            source: "stored",
            insightId: insight.id,
            createdAt: insight.createdAt.toISOString(),
            updatedAt: insight.updatedAt.toISOString(),
            model: insight.model,
            requestConfig: {
                weekStartsOn: insight.weekStartsOn,
                timeZone: insight.timeZone,
                includeDrafts: insight.includeDrafts,
            },
            summaryPreview: extractSummaryPreview(insight.ai),
            debugIncluded: query.includeDebug,
            ...(query.includeDebug
                ? { generationContext: extractGenerationContext(insight.llmInput) }
                : {}),
        },
        ...(query.includeDebug
            ? {
                computed: insight.computed,
                llmInput: insight.llmInput,
            }
            : {}),
    };
}
