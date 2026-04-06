import { PracticeType } from "@prisma/client";
import { z } from "zod";

export const presetPracticeTypes = [
    PracticeType.HALF_PRIMARY,
    PracticeType.FULL_PRIMARY,
    PracticeType.INTERMEDIATE,
    PracticeType.ADVANCED_A,
    PracticeType.ADVANCED_B,
] as const;

export const presetPracticeTypeSchema = z.enum(presetPracticeTypes);

export const sequenceSnippetSchema = z.object({
    group: z.enum(["PRIMARY", "INTERMEDIATE", "ADVANCED_A", "ADVANCED_B"]),
    upToSlug: z.string(),
});

export const presetBodySchema = z.object({
    date: z.coerce.date().optional(),
    label: z.string().optional(),
    duration: z.number().min(1).optional(),
    overallScore: z.number().min(1).max(10).optional(),
    energyLevel: z.number().min(1).max(10).optional(),
    mood: z.number().min(1).max(10).optional(),
    notes: z.string().optional(),
    practiceType: presetPracticeTypeSchema,
    scoredPoses: z.array(z.string()).optional(),
    candidateHash: z.string().min(1).optional(),
});

export const customBodySchema = z.object({
    date: z.coerce.date().optional(),
    label: z.string().optional(),
    duration: z.number().min(1).optional(),
    overallScore: z.number().min(1).max(10).optional(),
    energyLevel: z.number().min(1).max(10).optional(),
    mood: z.number().min(1).max(10).optional(),
    notes: z.string().optional(),
    practiceType: z.literal(PracticeType.CUSTOM),
    sequenceSnippets: z.array(sequenceSnippetSchema),
    scoredPoses: z.array(z.string()).optional(),
    candidateHash: z.string().min(1).optional(),
});

export const candidatesBodySchema = z.discriminatedUnion("mode", [
    z.object({
        mode: z.literal("preset"),
        practiceType: presetPracticeTypeSchema,
    }),
    z.object({
        mode: z.literal("custom"),
        practiceType: z.literal(PracticeType.CUSTOM),
        sequenceSnippets: z.array(sequenceSnippetSchema),
    }),
]);

export type PresetPracticeType = z.infer<typeof presetPracticeTypeSchema>;
export type SequenceSnippet = z.infer<typeof sequenceSnippetSchema>;
export type CandidatesBody = z.infer<typeof candidatesBodySchema>;
export type PresetBody = z.infer<typeof presetBodySchema>;
export type CustomBody = z.infer<typeof customBodySchema>;

export function formatValidationIssues(error: z.ZodError) {
    return error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
    }));
}
