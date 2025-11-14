import prisma from "../../lib/prisma";
import {Request, Response} from "express";

export const getAllPoses = async (req: Request, res: Response) => {
    const allPoses = await prisma.pose.findMany(
        {
            select: {
                sanskritName: true,
                sequenceGroup: true
            }
        }
    )

    if (allPoses.length === 0) {
        return res.status(404).json({ message: "No poses found." });
    }

    res.json(allPoses);
}