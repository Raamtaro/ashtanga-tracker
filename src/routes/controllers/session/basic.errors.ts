import type { Response } from "express";
import type { ZodIssue } from "zod";

export function sendUnauthorized(res: Response) {
    return res.status(401).json({ message: "Unauthorized" });
}

export function sendMissingSessionId(res: Response) {
    return res.status(400).json({ error: "Missing session id" });
}

export function sendSessionNotFound(res: Response) {
    return res.status(404).json({ error: "Session not found" });
}

export function sendSessionNotFoundOrNoPermission(res: Response) {
    return res.status(404).json({ error: "Session not found or no permission" });
}

export function sendSessionPublishedLocked(res: Response) {
    return res.status(409).json({ error: "Session is published. Unpublish to edit." });
}

export function sendInvalidInput(res: Response, issues: ZodIssue[]) {
    return res.status(422).json({
        message: "Invalid input",
        issues: issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
        })),
    });
}

export function sendInternalServerError(res: Response) {
    return res.status(500).json({ error: "Internal server error" });
}
