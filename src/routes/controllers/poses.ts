import prisma from "../../lib/prisma";
import {Request, Response} from "express";

export const getAllPoses = async (req: Request, res: Response) => {
    const allPoses = await prisma.pose.findMany(
        {
            select: {
                id: true,
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


export const getPoseById = async (req: Request, res: Response) => {
    const { id } = req.params;

    const pose = await prisma.pose.findUnique({
        where: { id: id },
        select: {
            englishName: true,
            sanskritName: true,
            scoreCards: true
        }
    });

    if (!pose) {
        return res.status(404).json({ message: "Pose not found." });
    }

    res.json(pose);
}