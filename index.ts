import dotenv from "dotenv";

import prisma from "./src/lib/prisma.js";
import { createApp } from "./src/app.js";

dotenv.config();

const app = createApp();
const port = Number(process.env.PORT) || 3000;
let isShuttingDown = false;

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

async function startServer() {
    await connectWithRetry();

    const server = app.listen(port, "0.0.0.0", () => {
        console.log(`listening on port: ${port}`);
    });

    const shutdown = async (signal: string) => {
        if (isShuttingDown) return;
        isShuttingDown = true;

        console.log(`Received ${signal}. Shutting down gracefully...`);
        server.close(async () => {
            await prisma.$disconnect();
            process.exit(0);
        });
    };

    process.on("SIGINT", () => {
        void shutdown("SIGINT");
    });

    process.on("SIGTERM", () => {
        void shutdown("SIGTERM");
    });
}

startServer().catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
});
