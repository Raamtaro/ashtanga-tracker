import prisma from "../lib/prisma";
import {SequenceGroup as DBGroup, Pose, PrismaPromise } from "@prisma/client";
import { CATALOG } from "../lib/sequenceDef";

// map your catalog keys to Prisma enum values
const GROUP_MAP: Record<string, DBGroup> = {
  SUN: DBGroup.SUN_SALUTATIONS,
  STANDING: DBGroup.STANDING,
  PRIMARY_ONLY: DBGroup.PRIMARY,
  INTERMEDIATE_ONLY: DBGroup.INTERMEDIATE,
  ADVANCED_A_ONLY: DBGroup.ADVANCED_A,
  ADVANCED_B_ONLY: DBGroup.ADVANCED_B,
  FINISHING: DBGroup.FINISHING,
};

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function main() {
  console.log('Seeding poses from CATALOG...');

  const ops: PrismaPromise<Pose>[] = [];

  for (const [key, poses] of Object.entries(CATALOG)) {
    const group = GROUP_MAP[key];
    if (!group) {
      console.warn(`Skipping unknown group key "${key}"`);
      continue;
    }

    poses.forEach((p, idx) => {
      const data = {
        slug: slugify(p.name),
        sanskritName: p.name,
        sequenceGroup: group,
        orderInGroup: idx + 1,
        isTwoSided: !!p.isTwoSided,
      };

      // upsert keeps re-seeds idempotent and updates flags/order when you tweak lists
      ops.push(
        prisma.pose.upsert({
          where: { slug: data.slug },
          update: {
            sanskritName: data.sanskritName,
            sequenceGroup: data.sequenceGroup,
            orderInGroup: data.orderInGroup,
            isTwoSided: data.isTwoSided,
          },
          create: data,
        })
      );
    });
  }

  await prisma.$transaction(ops);
  console.log(`✅ Seeded/updated ${ops.length} poses.`);
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });