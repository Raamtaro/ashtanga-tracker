import { openai } from '../../../lib/openai.js';
import prisma from '../../../lib/prisma.js';
import { Request, Response } from "express";
// import { z } from "zod";

const REQUIRED_METRICS = ["ease", "comfort", "stability", "pain", "breath", "focus"] as const;
type MetricKey = (typeof REQUIRED_METRICS)[number];

function avg(nums: Array<number | null | undefined>) {
    const xs = nums.filter((n): n is number => typeof n === "number");
    if (!xs.length) return null;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export const getSessionAiInsight = async (req: Request, res: Response) => {
    const client = req.user as { id: string } | undefined;
    if (!client?.id) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing session id" });

    try {
        // Pull richer data than /session/:id returns (notes + required metrics)
        const session = await prisma.practiceSession.findFirst({
            where: { id, userId: client.id },
            select: {
                id: true,
                status: true,
                date: true,
                overallScore: true,
                label: true,
                practiceType: true,
                durationMinutes: true,
                scoreCards: {
                    orderBy: { orderInSession: "asc" },
                    select: {
                        id: true,
                        side: true,
                        skipped: true,
                        overallScore: true,

                        // Needed for AI insight
                        notes: true,
                        ease: true,
                        comfort: true,
                        stability: true,
                        pain: true,
                        breath: true,
                        focus: true,

                        pose: {
                            select: {
                                sanskritName: true,
                                sequenceGroup: true,
                                slug: true, // optional but useful
                            },
                        },
                    },
                },
            },
        });

        if (!session) return res.status(404).json({ error: "Session not found" });

        // If you want to restrict to published for MVP sanity:
        // if (session.status !== "PUBLISHED") return res.status(409).json({ error: "Session must be published to analyze." });

        const scoreCards = session.scoreCards.map((c) => {
            const missingAny =
                !c.skipped && REQUIRED_METRICS.some((k) => (c as any)[k] == null);
            return {
                id: c.id,
                side: c.side,
                skipped: c.skipped,
                overallScore: c.overallScore,
                isComplete: c.skipped ? true : !missingAny,
                pose: {
                    sanskritName: c.pose.sanskritName,
                    sequenceGroup: c.pose.sequenceGroup,
                    slug: c.pose.slug,
                },

                // include for AI only; client doesn’t need these on /session/:id
                notes: c.notes,
                metrics: {
                    ease: c.ease,
                    comfort: c.comfort,
                    stability: c.stability,
                    pain: c.pain,
                    breath: c.breath,
                    focus: c.focus,
                },
            };
        });

        const activeCards = scoreCards.filter((c) => !c.skipped);

        const metricAverages: Record<MetricKey, number | null> = {
            ease: avg(activeCards.map((c) => c.metrics.ease)),
            comfort: avg(activeCards.map((c) => c.metrics.comfort)),
            stability: avg(activeCards.map((c) => c.metrics.stability)),
            pain: avg(activeCards.map((c) => c.metrics.pain)),
            breath: avg(activeCards.map((c) => c.metrics.breath)),
            focus: avg(activeCards.map((c) => c.metrics.focus)),
        };

        // Pain hot spots: highest pain first
        const painHotSpots = [...activeCards]
            .filter((c) => typeof c.metrics.pain === "number")
            .sort((a, b) => (b.metrics.pain ?? -1) - (a.metrics.pain ?? -1))
            .slice(0, 5)
            .map((c) => ({
                scoreCardId: c.id,
                pose: c.pose.sanskritName,
                side: c.side,
                pain: c.metrics.pain,
                notes: c.notes ?? null,
            }));

        const summary = {
            total: scoreCards.length,
            complete: scoreCards.filter((c) => c.isComplete).length,
            incomplete: scoreCards.filter((c) => !c.isComplete).length,
            firstIncompleteScoreCardId: scoreCards.find((c) => !c.isComplete)?.id ?? null,
        };

        const payloadForModel = {
            session: {
                id: session.id,
                status: session.status,
                date: session.date.toISOString(),
                label: session.label,
                practiceType: session.practiceType,
                durationMinutes: session.durationMinutes,
                overallScore: session.overallScore,
            },
            summary,
            computed: {
                metricAverages,
                painHotSpots,
            },
            scoreCards: scoreCards.map((c) => ({
                id: c.id,
                pose: c.pose.sanskritName,
                group: c.pose.sequenceGroup,
                side: c.side,
                skipped: c.skipped,
                overallScore: c.overallScore,
                metrics: c.metrics,
                notes: c.notes,
            })),
        };

        const system = `
You are a careful yoga practice review assistant.
Analyze one practice session.

Return STRICT JSON with keys:
- summary: string (2-4 sentences)
- insights: string[] (3-6 bullets)
- redFlags: string[] (only if supported by pain/notes patterns; otherwise empty)
- followUps: string[] (questions the user could answer next time)

Constraints:
- No medical diagnosis.
- If pain is high or notes suggest injury, recommend caution and professional guidance.
`.trim();

        const user = `
Analyze the following session.
Pay special attention to pain + stability + breath/focus and any notes.

DATA:
${JSON.stringify(payloadForModel)}
`.trim();

        const completion = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            temperature: 0.4,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: system },
                { role: "user", content: user },
            ],
        });

        const raw = completion.choices[0]?.message?.content ?? "{}";
        let ai: any;
        try {
            ai = JSON.parse(raw);
        } catch {
            ai = { summary: "Failed to parse model output", insights: [], redFlags: [], followUps: [] };
        }

        return res.json({
            session: {
                id: session.id,
                status: session.status,
                date: session.date.toISOString(),
                overallScore: session.overallScore,
                summary,
            },
            computed: { metricAverages, painHotSpots },
            ai,
            debug: { model: completion.model, raw }, // remove later if you want
        });
    } catch (err) {
        console.error("getSessionAiInsight error", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};