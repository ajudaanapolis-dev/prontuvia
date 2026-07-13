import { buildApp } from "./app.js";
import { config } from "./config.js";
import { runNotificationWorker } from "./notifications.js";

const app = await buildApp();

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  await app.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host: config.HOST, port: config.PORT });
void runNotificationWorker().catch(error=>app.log.error({err:error},"notification worker failed"));
const workerTimer=setInterval(()=>void runNotificationWorker().catch(error=>app.log.error({err:error},"notification worker failed")),config.NOTIFICATION_WORKER_INTERVAL_SECONDS*1000);
workerTimer.unref();
