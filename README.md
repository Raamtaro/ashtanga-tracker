# Ashtanga Tracker

A small Express + TypeScript app using Prisma and PostgreSQL to let students log and score their Ashtanga yoga practices.

This README reflects the repository layout and runtime/developer workflows as of the current code.

## What the app does

- Generate a PracticeSession consisting of poses grouped as: Sun salutations, Standing, Series-specific (Primary/Intermediate/Advanced), Backbends, Finishing.
- For each Pose the app creates one or two ScoreCards depending on `isTwoSided`.
- Users can save sessions as DRAFT and then PUBLISH them when ready. Each session contains multiple ScoreCards which are individually updatable.

## Quick start (developer)

Prerequisites:
- Node 18+ (or project's supported Node)
- PostgreSQL and a `DATABASE_URL` env variable

Install and run:

```bash
npm install
cp .env.example .env   # set DATABASE_URL + auth secrets
npx prisma migrate dev # in development only
npx prisma generate
npm run dev
```

Build for production:

```bash
npm run build
npm start
```

## Project structure

- `index.ts` — app entry (dev runner)
- `src/lib/prisma.ts` — Prisma client instance
- `src/routes/` — route modules and controllers
  - `controllers/session` — session create/read/publish controllers
- `src/seed/sequenceDef.ts` — canonical sequence/pose definitions and exported series
- `prisma/schema.prisma` — database schema and models

## Sequence & Pose typing (important)

In `src/seed/sequenceDef.ts` the following types are used:

- `Pose` — { name: string; isTwoSided: boolean }
- `SequenceGroup` — `Pose[]`
- `SequenceDefinition` — { name: string; description?: string; poses: SequenceGroup }

Rules to follow when editing sequences:

- Always use `Pose` objects (not raw `string[]`).
- Set `isTwoSided` correctly for poses that should generate 2 ScoreCards.
- Exported series (e.g., `primarySeries`) are `SequenceDefinition` and built by spreading `SequenceGroup` constants like `sharedStanding`, `primaryPoses`, and `sharedFinishing`.

## Recommended pattern: safe publish toggle

Toggle session publish state while ensuring ownership and avoiding race conditions. The preferred Prisma-safe pattern is to use conditional `updateMany` (which includes `userId` in `where`) and then read the row to return it. This prevents updating sessions you don't own and is atomic at the DB update step.

See `src/routes/controllers/session/basic.ts` for an example implementation.

## Type checking & build

Type checking / compilation is via `tsc`:

```bash
npm run build
```

If you edit seed files, run the build to catch type errors quickly.

## Seeds and development aids

- `src/seed/sequenceDef.ts` is the source of truth for poses. Adding or changing poses should be done there.
- Consider adding a small debug script that prints the fully-expanded `primarySeries` to validate that `isTwoSided` flags and spreads are correct.

## Next improvements

- Add integration tests for session creation, ScoreCard generation and publish flows.
- Consider a small CLI to validate seed data and export a CSV of all poses.

