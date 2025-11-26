/** Compute overallScore: average of (ease, comfort, stability, breath, focus, invPain) */
export function computeOverallScore(sc: {
    ease?: number | null;
    comfort?: number | null;
    stability?: number | null;
    breath?: number | null;
    focus?: number | null;
    pain?: number | null;
}) {
    const parts: number[] = [];
    if (sc.ease != null) parts.push(sc.ease);
    if (sc.comfort != null) parts.push(sc.comfort);
    if (sc.stability != null) parts.push(sc.stability);
    if (sc.breath != null) parts.push(sc.breath);
    if (sc.focus != null) parts.push(sc.focus);
    if (sc.pain != null) {
        // lower pain should boost overall; invert (1–10) → (10–1)
        const invPain = 11 - sc.pain;
        parts.push(invPain);
    }
    if (!parts.length) return null;
    const avg = parts.reduce((a, b) => a + b, 0) / parts.length;
    return Math.round(avg * 10) / 10; // 1 decimal
}