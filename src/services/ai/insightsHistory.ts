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

export const insightsHistoryQuerySchema = z.object({
    type: z.enum(INSIGHT_TYPES).optional(),
    limit: z.coerce.number().int().positive().max(100).default(20),
    cursor: z.string().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    poseId: z.string().min(1).optional(),
    includeDebug: z.coerce.boolean().default(false),
}).superRefine((input, ctx) => {
    if (input.from && input.to && input.from > input.to) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["to"],
            message: "to must be on or after from",
        });
    }

    if (input.poseId && input.type === "weekly") {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["poseId"],
            message: "poseId is only supported when type is pose or omitted",
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

function toDateTimeFilter(from: Date | undefined, to: Date | undefined): Prisma.DateTimeFilter | undefined {
    const filter: Prisma.DateTimeFilter = {};
    if (from) filter.gte = from;
    if (to) filter.lte = to;
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
    const dateDiff = new Date(b.meta.createdAt).getTime() - new Date(a.meta.createdAt).getTime();
    if (dateDiff !== 0) return dateDiff;

    const rankDiff = insightTypeRank[b.type] - insightTypeRank[a.type];
    if (rankDiff !== 0) return rankDiff;

    return b.meta.insightId.localeCompare(a.meta.insightId);
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
    const createdAtFilter = toDateTimeFilter(query.from, query.to);
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
            createdAt: lastItem.meta.createdAt,
            type: lastItem.type,
            id: lastItem.meta.insightId,
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
            from: query.from?.toISOString() ?? null,
            to: query.to?.toISOString() ?? null,
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
