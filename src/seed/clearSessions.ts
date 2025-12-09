import prisma from "../lib/prisma";
import { Prisma } from "@prisma/client";

function getArg(flag: string): string | undefined {
    const idx = process.argv.indexOf(flag);
    return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main() {
    const yes = process.argv.includes('--yes') || process.env.CONFIRM === '1';
    const userId = getArg('--user'); // optional: limit to a single user's data

    if (!yes) {
        console.error(
            'Refusing to run destructive clear without --yes (or set CONFIRM=1).'
        );
        process.exit(1);
    }

    // Build where clause for PracticeSession (optional user filter)
    const where: Prisma.PracticeSessionWhereInput = userId ? { userId } : {};

    // Count what will be deleted (scorecards via session -> cascade)
    const [sessionCount, scoreCardCount] = await Promise.all([
        prisma.practiceSession.count({ where }),
        prisma.scoreCard.count({
            where: userId ? { session: { userId } } : {},
        }),
    ]);

    console.log(`About to delete:`);
    console.log(`  Sessions:   ${sessionCount}`);
    console.log(`  ScoreCards: ${scoreCardCount} (via ON DELETE CASCADE)`);

    // If nothing to delete, bail early
    if (sessionCount === 0) {
        console.log('Nothing to delete. Exiting.');
        return;
    }

    // One transaction; rely on cascade from ScoreCard.sessionId -> PracticeSession.id
    await prisma.$transaction(async (tx) => {
        const result = await tx.practiceSession.deleteMany({ where });
        console.log(`Deleted sessions: ${result.count}`);
    });

    console.log('Done.');
}

main()
    .catch((e) => {
        console.error('Error clearing sessions/scorecards:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
