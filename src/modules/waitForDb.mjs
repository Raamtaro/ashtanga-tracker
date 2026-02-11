// scripts/waitForDb.mjs
import net from "node:net";

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function parseDb(urlStr) {
    const u = new URL(urlStr);
    return { host: u.hostname, port: Number(u.port || 5432) };
}

async function tryConnect(host, port, timeoutMs = 3000) {
    return new Promise((resolve) => {
        const socket = net.createConnection({ host, port });
        const done = (ok) => {
            socket.removeAllListeners();
            socket.destroy();
            resolve(ok);
        };

        socket.setTimeout(timeoutMs);
        socket.on("connect", () => done(true));
        socket.on("timeout", () => done(false));
        socket.on("error", () => done(false));
    });
}

async function main() {
    const url = process.env.DATABASE_URL;
    if (!url) {
        console.error("DATABASE_URL is missing");
        process.exit(1);
    }

    const { host, port } = parseDb(url);

    const maxAttempts = 30; // ~ up to ~60–90s depending on backoff
    for (let i = 1; i <= maxAttempts; i++) {
        const ok = await tryConnect(host, port);
        if (ok) {
            console.log(`✅ DB reachable at ${host}:${port}`);
            return;
        }
        const delay = Math.min(1000 + i * 500, 5000);
        console.log(`⏳ DB not reachable yet (${i}/${maxAttempts}). Retrying in ${delay}ms...`);
        await sleep(delay);
    }

    console.error(`❌ DB still not reachable at ${host}:${port} after ${maxAttempts} attempts`);
    process.exit(1);
}

main();
