import dotenv from "dotenv";

import prisma from "./src/lib/prisma.js";
import { createApp } from "./src/app.js";

dotenv.config();

const app = createApp();
const port = Number(process.env.PORT) || 3000;

async function connectWithRetry() {
    let attempt = 0;

    while (true) {
        attempt += 1;
        try {
            await prisma.$connect();
            console.log(`Prisma connected (attempt ${attempt})`);
            return;
        } catch (error: unknown) {
            const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
            const reason = error instanceof Error ? error.message : String(error);
            console.log(`Prisma connect failed (attempt ${attempt}). Retrying in ${delay}ms. ${reason}`);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
}

app.listen(port, "0.0.0.0", () => {
    console.log(`listening on port: ${port}`);
});

connectWithRetry().catch((error) => {
    console.error("Failed to connect to Prisma after multiple attempts:", error);
    process.exit(1);
});

