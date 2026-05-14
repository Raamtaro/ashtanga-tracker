import rateLimit from "express-rate-limit";

function parsePositiveInt(raw: string | undefined, fallback: number) {
    if (!raw) return fallback;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
    return parsed;
}

const authWindowMs = parsePositiveInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS, 15 * 60 * 1000);
const authLimit = parsePositiveInt(process.env.RATE_LIMIT_AUTH_LIMIT, 50);

const aiWindowMs = parsePositiveInt(process.env.RATE_LIMIT_AI_WINDOW_MS, 15 * 60 * 1000);
const aiLimit = parsePositiveInt(process.env.RATE_LIMIT_AI_LIMIT, 20);

const trendWindowMs = parsePositiveInt(process.env.RATE_LIMIT_TREND_WINDOW_MS, 15 * 60 * 1000);
const trendLimit = parsePositiveInt(process.env.RATE_LIMIT_TREND_LIMIT, 120);

const baseConfig = {
    standardHeaders: true,
    legacyHeaders: false,
} as const;

export const authLimiter = rateLimit({
    ...baseConfig,
    windowMs: authWindowMs,
    limit: authLimit,
    message: { error: "Too many auth attempts. Try again later." },
});

export const aiLimiter = rateLimit({
    ...baseConfig,
    windowMs: aiWindowMs,
    limit: aiLimit,
    message: { error: "Too many AI insight requests. Try again later." },
});

export const trendLimiter = rateLimit({
    ...baseConfig,
    windowMs: trendWindowMs,
    limit: trendLimit,
    message: { error: "Too many trend requests. Try again later." },
});
