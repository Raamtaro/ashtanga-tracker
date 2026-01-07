import prisma from "../../lib/prisma";
import jwt from 'jsonwebtoken'
import bcrypt from "bcryptjs";
import passport from "passport";
import { NextFunction, Request, Response } from 'express';
import { User } from "@prisma/client";
import { IVerifyOptions } from "passport-local";
import { z } from "zod";

// const createAccountSchema = z.object( //Need to implement this schema validation in the signup route
//     {
//         name: z.string().min(1, "Name is required"),
//         email: z.email("Invalid email address"),
//         password: z.string().min(6, "Password must be at least 6 characters long"),
//     }
// )

const deleteAccountSchema = z.object({
    password: z.string().min(1, "Password is required"),
});

export const signup = async (req: Request, res: Response): Promise<void> => {
    const { name, email, password } = req.body;
    console.log(name, email, password);
    if (!name || !email || !password) {
        res.status(400).json({ error: 'Please include email, password and name' });
        return;
    }

    const existingUser = await prisma.user.findUnique(
        {
            where: { email: email }
        }
    )

    if (existingUser) {
        res.status(400).json(
            {
                error: `An account with ${email} already exists`
            }
        )
        return;
    }

    const hashedPassword = await bcrypt.hash(password, 11)
    const newUser = await prisma.user.create(
        {
            data: {
                name: name,
                email: email,
                password: hashedPassword
            }
        }
    )

    res.status(201).json({ newUser })
}

export const loginUser = (req: Request, res: Response, next: NextFunction): void => {
    passport.authenticate('local', { session: false }, (err: Error, user: User, info: IVerifyOptions) => {
        if (err) {
            return next(err)
        }
        if (!user) {
            return res.status(400).json({ error: info.message })
        }

        const payload = { userId: user.id }
        const secret = process.env.JWT_SECRET as string
        const token = jwt.sign(payload, secret, { expiresIn: '1h' })

        res.json({ user, token })
    }
    )(req, res, next)
}

export const deleteAccount = async (req: Request, res: Response) => {
    const client = req.user as { id: string } | undefined;
    if (!client?.id) return res.status(401).json({ error: "Unauthorized" });

    // Validate body
    const parsed = deleteAccountSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            error: "Invalid request",
            issues: parsed.error.issues.map((i) => ({
                path: i.path.join("."),
                message: i.message,
                code: i.code,
            })),
        });
    }

    const { password } = parsed.data;

    // Verify password
    const user = await prisma.user.findUnique({
        where: { id: client.id },
        select: { id: true, password: true },
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(403).json({ error: "Incorrect password" });

    // Delete everything user-owned in a transaction
    await prisma.$transaction(async (tx) => {
        // Sessions owned by user
        const sessions = await tx.practiceSession.findMany({
            where: { userId: user.id },
            select: { id: true },
        });

        const sessionIds = sessions.map((s) => s.id);

        // ScoreCards (depend on sessions)
        if (sessionIds.length) {
            await tx.scoreCard.deleteMany({
                where: { sessionId: { in: sessionIds } },
            });
        }

        // Sessions
        await tx.practiceSession.deleteMany({
            where: { userId: user.id },
        });

        // If you have other per-user tables, delete them here:
        // await tx.someTable.deleteMany({ where: { userId: user.id } });

        // Finally, delete user
        await tx.user.delete({ where: { id: user.id } });
    });

    // 200 is convenient for client flows (show message, then redirect)
    return res.status(200).json({ ok: true, message: "Account deleted" });
};


// Helper for me can delete later
export const getAllUsers = async (req: Request, res: Response) => {
    const allUsers = await prisma.user.findMany(

    )

    if (allUsers.length === 0) {
        return res.status(404).json({ message: "No users found." });
    }

    res.json(allUsers);
}