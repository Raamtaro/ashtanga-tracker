import {
    addDaysUtc,
    average,
    dayPartForDate,
    endExclusiveUtcDay,
    extractKeywordCounts,
    isoDate,
    keywordDelta,
    linearRegressionSlope,
    metricStatsMap,
    startOfUtcWeek,
    summarizeNumericStats,
} from "./helpers.js";

describe("insights helpers", () => {
    it("computes average while ignoring null and undefined values", () => {
        expect(average([null, undefined, 4, 6])).toBe(5);
        expect(average([null, undefined])).toBeNull();
    });

    it("summarizes numeric stats with count, average, median and bounds", () => {
        const stats = summarizeNumericStats([1, 2, 3, 4, null]);

        expect(stats).toEqual({
            count: 4,
            average: 2.5,
            stdDev: 1.118,
            min: 1,
            max: 4,
            median: 2.5,
        });
    });

    it("returns null regression slope for insufficient data and computes slope otherwise", () => {
        expect(linearRegressionSlope([{ x: 1, y: 2 }])).toBeNull();
        expect(linearRegressionSlope([
            { x: 0, y: 1 },
            { x: 1, y: 2 },
            { x: 2, y: 3 },
        ])).toBe(1);
    });

    it("computes UTC date helpers consistently", () => {
        const d = new Date("2026-04-07T18:30:00.000Z");
        expect(endExclusiveUtcDay(d).toISOString()).toBe("2026-04-08T00:00:00.000Z");
        expect(addDaysUtc(d, 2).toISOString()).toBe("2026-04-09T18:30:00.000Z");
        expect(isoDate(d)).toBe("2026-04-07");
    });

    it("computes UTC week start for monday and sunday variants", () => {
        const anchor = new Date("2026-04-09T10:00:00.000Z"); // Thursday
        expect(startOfUtcWeek(anchor, "MONDAY").toISOString()).toBe("2026-04-06T00:00:00.000Z");
        expect(startOfUtcWeek(anchor, "SUNDAY").toISOString()).toBe("2026-04-05T00:00:00.000Z");
    });

    it("derives day part by timezone-adjusted hour", () => {
        const morningUtc = new Date("2026-04-07T12:00:00.000Z");
        expect(dayPartForDate(morningUtc, "America/Chicago")).toBe("EARLY_MORNING");

        const eveningUtc = new Date("2026-04-07T23:00:00.000Z");
        expect(dayPartForDate(eveningUtc, "America/Chicago")).toBe("EVENING");
    });

    it("extracts keyword counts while filtering stopwords and punctuation", () => {
        const keywords = extractKeywordCounts([
            "Felt strong and stable in standing",
            "Strong breath, stable focus",
            "Lower back felt tight",
        ], { maxKeywords: 5 });

        expect(keywords).toEqual({
            strong: 2,
            stable: 2,
            back: 1,
            breath: 1,
            focus: 1,
        });
    });

    it("computes keyword deltas between current and previous maps", () => {
        const delta = keywordDelta(
            { strong: 4, focus: 3, breath: 1 },
            { strong: 2, focus: 5, pain: 1 },
        );

        expect(delta).toEqual({
            focus: -2,
            strong: 2,
            breath: 1,
            pain: -1,
        });
    });

    it("builds metric stats map from rows", () => {
        const stats = metricStatsMap(
            [
                { ease: 8, comfort: 7 },
                { ease: 6, comfort: null },
                { ease: null, comfort: 9 },
            ],
            ["ease", "comfort"],
        );

        expect(stats.ease.count).toBe(2);
        expect(stats.ease.average).toBe(7);
        expect(stats.comfort.count).toBe(2);
        expect(stats.comfort.average).toBe(8);
    });
});

