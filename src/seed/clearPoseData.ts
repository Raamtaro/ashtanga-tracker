/**
 * WARNING: This file will clear Session and ScoreCard Data as well.
 * - For use in production, consider backing up data first
 * - Need to reseed poses after running this script
 */

import prisma from "../lib/prisma";
import type { Prisma } from "@prisma/client";

const args = process.argv.slice(2);

function hasFlag(name: string) {
    return args.includes(`--${name}`);
}
function getArg(name: string) {
    const idx = args.findIndex(a => a === `--${name}`);
    if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) return args[idx + 1];
    const eq = args.find(a => a.startsWith(`--${name}=`));
    return eq ? eq.split('=')[1] : undefined;
}

async function main() {
    const confirm = hasFlag('yes') || process.env.CONFIRM === '1';
    if (!confirm) {
        console.log('Refusing to run destructive clear without --yes (or set CONFIRM=1).');
        process.exit(1);
    }

    const userId = getArg('user') ?? process.env.USER_ID;
    const keepPoses = hasFlag('keep-poses');

    console.log('=== CLEAR YOGA DATA ===');
    console.log(`Scope: ${userId ? `userId=${userId}` : 'ALL USERS'}`);
    console.log(`Poses: ${keepPoses ? 'KEEP' : 'DELETE'}`);

    // Build scoped where clauses
    const scoreCardWhere: Prisma.ScoreCardWhereInput = userId
        ? { session: { userId } } // relational filter via session
        : {};

    const sessionWhere: Prisma.PracticeSessionWhereInput = userId
        ? { userId }
        : {};

    // Do it in explicit order for clarity:
    // 1) ScoreCards (explicitly, even though deleting sessions would cascade)
    // 2) PracticeSessions (cascades would also remove ScoreCards if any are left)
    // 3) Poses (optional; deleting poses would also cascade to ScoreCards)
    const result = await prisma.$transaction(async (tx) => {
        const delSC = await tx.scoreCard.deleteMany({ where: scoreCardWhere });
        const delSessions = await tx.practiceSession.deleteMany({ where: sessionWhere });

        let delPosesCount = 0;
        if (!keepPoses) {
            const delPoses = await tx.pose.deleteMany({});
            delPosesCount = delPoses.count;
        }

        return {
            scoreCards: delSC.count,
            sessions: delSessions.count,
            poses: delPosesCount,
        };
    });

    console.log('Deleted:', result);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });