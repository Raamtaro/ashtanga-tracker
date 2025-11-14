import prisma from "../../lib/prisma";
import jwt from 'jsonwebtoken'
import bcrypt from "bcryptjs";
import passport from "passport";
import { Request, Response} from 'express';

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


// Helper for me can delete later

export const getAllUsers = async (req: Request, res: Response) => {
    const allUsers = await prisma.user.findMany(

    )

    if (allUsers.length === 0) {
        return res.status(404).json({ message: "No users found." });
    }

    res.json(allUsers);
}