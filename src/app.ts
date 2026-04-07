import express, { type Express, type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { randomUUID } from "crypto";
import { ZodError } from "zod";
import cors from "cors";
import passport from "passport";

import routes from "./routes/index.js";
import { localStrategy } from "./config/passportLocal.js";
import { jwtStrategy } from "./config/passportJwt.js";

export function createApp(): Express {
    const app: Express = express();
    const isTest = process.env.NODE_ENV === "test";

    if (process.env.NODE_ENV === "production") {
        app.set("trust proxy", 1);
    }

    app.use(
        pinoHttp({
            enabled: !isTest,
            genReqId: (req, res) => {
                const incoming = req.headers["x-request-id"];
                const id = (Array.isArray(incoming) ? incoming[0] : incoming) ?? randomUUID();
                res.setHeader("X-Request-Id", id);
                return id;
            },
            redact: ["req.headers.authorization"],
        }),
    );

    app.use(helmet());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    const corsOrigins = (process.env.CORS_ORIGIN ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

    app.use(
        cors({
            origin: corsOrigins.length ? corsOrigins : true,
            credentials: true,
            allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
            methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        }),
    );

    const authLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 50,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: "Too many auth attempts. Try again later." },
    });
    app.use("/auth", authLimiter);

    passport.use(localStrategy);
    passport.use(jwtStrategy);
    app.use(passport.initialize());

    app.use("/pose", routes.poses);
    app.use("/auth", routes.auth);
    app.use("/session", routes.session);
    app.use("/score-card", routes.scoreCard);
    app.use("/health", routes.health);
    app.use("/ai/insights", routes.aiInsights);
    app.use("/ai", routes.ai);

    app.use((_req, res) => res.status(404).json({ error: "Not found" }));

    app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
        if (err instanceof ZodError) {
            return res.status(400).json({
                error: "Validation failed",
                issues: err.issues.map((issue) => ({
                    path: issue.path.join("."),
                    message: issue.message,
                })),
            });
        }

        const status =
            typeof err === "object" &&
            err !== null &&
            "status" in err &&
            typeof (err as { status?: unknown }).status === "number"
                ? (err as { status: number }).status
                : 500;

        const message =
            err instanceof Error
                ? err.message
                : "Internal server error";

        const requestId = (req as Request & { id?: string }).id;
        req.log?.error({ err, requestId }, "Unhandled error");

        return res.status(status).json({
            error: message,
            requestId,
        });
    });

    return app;
}
