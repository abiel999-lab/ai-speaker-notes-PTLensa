import { config } from "./config.js";
import { createApp } from "./app.js";
const cfg = config();
const { app } = await createApp(cfg);
await app.listen({ host: cfg.host, port: cfg.port });
console.log(`Verbatim Studio listening on ${cfg.host}:${cfg.port}. AI ${cfg.key ? "configured" : "not configured"}.`);
for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, async () => {
        await app.close();
        process.exit(0);
    });
