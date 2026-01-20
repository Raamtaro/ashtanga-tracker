import prisma from "../../lib/prisma";
import {Request, Response} from "express";
import {openai} from "../../lib/openai";
import {z} from "zod"




function iso(d: Date) {
    return d.toISOString();
}

export const getSessionInsights = async (req: Request, res: Response) => {
    

}