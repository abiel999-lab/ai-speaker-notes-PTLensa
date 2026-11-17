import { Worker } from "bullmq";
import { config } from "./config.js";
import { Repository } from "./repository.js";
import { processJob, redisConnection } from "./jobs.js";
const cfg = config();
if (!cfg.redis)
    throw new Error("REDIS_URL is required for the separate worker.");
const repo = new Repository(cfg.root, cfg.database);
await repo.init();
const worker = new Worker("verbatim-generate", async (job) => processJob(repo, cfg, job.data.id), {
    connection: {
        ...redisConnection(cfg.redis),
        maxRetriesPerRequest: null,
        enableOfflineQueue: true,
    },
    concurrency: 1,
});
worker.on("error", () => console.error("Worker connection failed. Check Redis configuration."));
for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, async () => {
        await worker.close();
        await repo.close();
        process.exit(0);
    });
