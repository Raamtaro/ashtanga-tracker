import express, { Express, Request, Response, NextFunction } from "express";
import routes from "./src/routes/index.js";
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { randomUUID } from "crypto";
import { ZodError } from "zod";

import passport from "passport";
import { localStrategy } from "./src/config/passportLocal.js";
import { jwtStrategy } from "./src/config/passportJwt.js";

import session from "express-session";
import prisma from "./src/lib/prisma.js";
import { PrismaSessionStore } from "@quixo3/prisma-session-store";
import cors from "cors";


dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3000;

if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1); // trust first proxy - for Railway deployments
}

app.use(
    pinoHttp({
        genReqId: (req, res) => {
            const incoming = req.headers["x-request-id"];
            const id =
                (Array.isArray(incoming) ? incoming[0] : incoming) ?? randomUUID();
            res.setHeader("X-Request-Id", id);
            return id;
        },

        redact: ["req.headers.authorization"],
    })
);

app.use(helmet());


app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const corsOrigins =
    (process.env.CORS_ORIGIN ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

app.use(
    cors({
        origin: corsOrigins.length ? corsOrigins : true, // true = reflect origin (OK for dev; tighten for prod)
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    })
);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many auth attempts. Try again later." },
});
app.use("/auth", authLimiter);


app.use(
    session(
        {
            store: new PrismaSessionStore(
                prisma,
                {
                    checkPeriod: 2 * 60 * 1000,  //ms
                    dbRecordIdIsSessionId: true,
                    dbRecordIdFunction: undefined,
                }
            ),
            secret: process.env.SESSION_SECRET as string,
            resave: false,
            saveUninitialized: false,
            cookie: {
                maxAge: 1000 * 60 * 60 * 24,
                secure: process.env.NODE_ENV === "production",
                sameSite: process.env.NODE_ENV === "production" ? "lax" : "lax",
            }
        }
    )
)

passport.use(localStrategy)
passport.use(jwtStrategy)
app.use(passport.initialize())
app.use(passport.session())

app.use('/pose', routes.poses);
app.use('/auth', routes.auth);
app.use('/session', routes.session);
app.use('/score-card', routes.scoreCard);
app.use('/health', routes.health);

app.use((req, res) => {
    return res.status(404).json({ error: "Not found" });
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    // Zod validation errors -> 400 with useful issues for client
    if (err instanceof ZodError) {
        return res.status(400).json({
            error: "Validation failed",
            issues: err.issues.map((i) => ({
                path: i.path.join("."),
                message: i.message,
            })),
        });
    }

    // Your own thrown errors could carry status
    const status = err?.status ?? 500;

    // request id is on req.id via pino-http
    const requestId = (req as any).id;
    req.log?.error({ err, requestId }, "Unhandled error");

    return res.status(status).json({
        error: err?.message ?? "Internal server error",
        requestId,
    });
});

app.listen(port, (): void => {
    console.log(`listening on port: ${port}`)
})