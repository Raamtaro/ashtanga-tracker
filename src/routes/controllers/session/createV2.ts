import prisma from "../../../lib/prisma";
import { SequenceSegment, PracticeType, Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { z } from 'zod';

import { CATALOG, primaryOnly, intermediateOnly, advancedAOnly, advancedBOnly, type GroupKey } from '../../../lib/sequenceDef';


const slugify = (name: string) =>
    name.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

type PlanItem = {
    // we keep pose identity by name -> slug
    name: string;
    slug: string;
    // which UI segment this item will be displayed under
    segment: SequenceSegment;
};

const SEGMENT_FOR_GROUP: Record<GroupKey, SequenceSegment> = {
    SUN: 'SUN_A',             // will be fixed per pose name (A/B) below
    STANDING: 'STANDING',
    PRIMARY_ONLY: 'PRIMARY',
    INTERMEDIATE_ONLY: 'INTERMEDIATE',
    ADVANCED_A_ONLY: 'ADVANCED_A',
    ADVANCED_B_ONLY: 'ADVANCED_B',
    FINISHING: 'FINISHING',
};


/**
 * Zod Schemas
 * 
 * Preset:
 * - date
 * 
 * - label? (optional, otherwise generated from practiceType)
 * 
 * - duration? (optional, how long did the practice last in minutes)
 * 
 * - practiceType (which sequence was practiced out of PRIMARY | INTERMEDIATE | ADVANCED_A | ADVANCED_B)
 * 
 * 
 * 
 * Custom: 
 * - date
 * 
 * - label? (optional, otherwise generated from practiceType)
 * 
 * - duration? (optional, how long did the practice last in minutes)
 * 
 * - sequenceSnippets:
 * -- array of objects with key value pair structured as { group: PRIMARY | INTERMEDIATE | ADVANCED_A | ADVANCED_B, upToSlug: string (which pose did you go up to in that particular group)}
 * 
 */


const presetBodySchema = z.object(
    {
        date: z.coerce.date().optional(), // if not provided, will default to current date
        label: z.string().optional(),
        duration: z.number().min(1).optional(),
        practiceType: z.enum(PracticeType)
    }
)

const customBodySchema = z.object(
    {
        date: z.coerce.date().optional(), // if not provided, will default to current date
        label: z.string().optional(), // will add some logic for this to default to the combination of segments - i.e. Primary + Partial (Intermediate | Advanced (A | B) )
        duration: z.number().min(1).optional(),
        practiceType: z.literal(PracticeType.CUSTOM),
        sequenceSnippets: z.array(
            z.object(
                {
                    group: z.enum(["PRIMARY", "INTERMEDIATE", "ADVANCED_A", "ADVANCED_B"]),
                    upToSlug: z.string()
                }
            )
        )
    }
)



export const createPresetSession = async (req: Request, res: Response) => {
    const client = req.user as { id: string } | undefined;
    if (!client?.id) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const body = presetBodySchema.parse(req.body);

    //1. Determine which poses to include based on practiceType
    //2. Prisma Transaction to create a PracticeSession and ScoreCards for each pose that is being practiced.
}

export const createCustomSession = async (req: Request, res: Response) => {
    const client = req.user as { id: string } | undefined;
    if (!client?.id) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const body = customBodySchema.parse(req.body);

    //1. Determine which poses to include based on practiceType
    //2. Prisma Transaction to create a PracticeSession and ScoreCards for each pose that is being practiced.
}