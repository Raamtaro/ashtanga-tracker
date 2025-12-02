import express, { Express, Request, Response, NextFunction } from "express";
import routes from "./src/routes";
import dotenv from 'dotenv';

import passport from "passport";
import { localStrategy } from "./src/config/passportLocal";
import { jwtStrategy } from "./src/config/passportJwt";
import session from "express-session";
import prisma from "./src/lib/prisma";
import { PrismaSessionStore } from "@quixo3/prisma-session-store";
import cors from "cors";


dotenv.config();

const app: Express = express();
const port: number = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
    cors(
        {
            origin: process.env.CORS_ORIGIN,
            credentials: true,
            
        }
    )
)

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
            cookie: { maxAge: 1000 * 60 * 60 * 24 }
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

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(err.stack);
    res.status(500).send("Something Broke!")
})

app.listen(port, (): void => {
    console.log(`listening on port: ${port}`)
})