import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import { config } from "./config.js";
import { pool } from "./db.js";
import { authRoutes } from "./routes/auth.js";
import { patientRoutes } from "./routes/patients.js";
import { appointmentRoutes } from "./routes/appointments.js";
import { recordRoutes } from "./routes/records.js";
import { auditRoutes } from "./routes/audit.js";
import { contextRoutes } from "./routes/context.js";
import { documentRoutes } from "./routes/documents.js";
import { classificationRoutes } from "./routes/classifications.js";
import { waitlistRoutes } from "./routes/waitlist.js";
import { financeRoutes } from "./routes/finance.js";
import { adminRoutes } from "./routes/admin.js";
import { commercialRoutes } from "./routes/commercial.js";
import { reportRoutes } from "./routes/reports.js";
import { operationRoutes } from "./routes/operations.js";
import { corsMethods } from "./cors.js";
import { communicationRoutes } from "./routes/communications.js";
import { publicBookingRoutes } from "./routes/public-booking.js";
import { patientPortalRoutes } from "./routes/patient-portal.js";
import { advancedRoutes } from "./routes/advanced.js";
import { medplumBridgeRoutes } from "./routes/medplum.js";
import { processPendingFhirSync } from "./fhir-sync.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === "production" ? "info" : "debug",
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "res.headers.set-cookie",
          "body.password",
          "password",
          "content",
        ],
        censor: "[REDACTED]",
      },
    },
    trustProxy: true,
    bodyLimit: 1_048_576,
    requestIdHeader: "x-request-id",
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: config.WEB_ORIGIN,
    credentials: true,
    methods: [...corsMethods],
    allowedHeaders: ["Content-Type", "X-Request-Id"],
    strictPreflight: true,
  });
  await app.register(cookie, { secret: config.COOKIE_SECRET, hook: "onRequest" });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });

  app.addHook("onResponse", (request, _reply, done) => {
    if (request.auth && ["POST", "PUT", "PATCH"].includes(request.method)) {
      const context = { ...request.auth, requestId: `${request.id}:fhir` };
      setImmediate(() => processPendingFhirSync(context).catch((error) => request.log.warn({ error }, "FHIR background sync failed")));
    }
    done();
  });

  app.get("/health", async (_request, reply) => {
    await pool.query("SELECT 1");
    return reply.send({ status: "ok" });
  });

  await app.register(authRoutes, { prefix: "/v1/auth" });
  await app.register(contextRoutes, { prefix: "/v1/context" });
  await app.register(patientRoutes, { prefix: "/v1/patients" });
  await app.register(appointmentRoutes, { prefix: "/v1/appointments" });
  await app.register(recordRoutes, { prefix: "/v1/records" });
  await app.register(documentRoutes, { prefix: "/v1/documents" });
  await app.register(classificationRoutes, { prefix: "/v1/classifications" });
  await app.register(waitlistRoutes, { prefix: "/v1/waitlist" });
  await app.register(financeRoutes, { prefix: "/v1/finance" });
  await app.register(adminRoutes, { prefix: "/v1/admin" });
  await app.register(commercialRoutes, { prefix: "/v1/commercial" });
  await app.register(reportRoutes, { prefix: "/v1/reports" });
  await app.register(operationRoutes, { prefix: "/v1/operations" });
  await app.register(communicationRoutes, { prefix: "/v1/communications" });
  await app.register(publicBookingRoutes, { prefix: "/v1/public/booking" });
  await app.register(patientPortalRoutes, { prefix: "/v1/patient-portal" });
  await app.register(advancedRoutes, { prefix: "/v1/advanced" });
  await app.register(medplumBridgeRoutes, { prefix: "/v2/medplum" });
  await app.register(auditRoutes, { prefix: "/v1/audit" });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: "validation_failed",
        issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      });
    }
    const databaseError = error as Error & { code?: string; constraint?: string };
    if (databaseError.code === "23P01" && databaseError.constraint === "appointments_no_professional_overlap") {
      return reply.code(409).send({ error: "appointment_conflict" });
    }
    if (databaseError.code === "23503") {
      return reply.code(400).send({ error: "invalid_reference" });
    }
    if (databaseError.code === "23505") {
      return reply.code(409).send({ error: "unique_value_conflict", constraint: databaseError.constraint });
    }
    if (databaseError.code === "23514") {
      return reply.code(400).send({ error: "invalid_database_value" });
    }
    request.log.error({ err: error }, "request failed");
    return reply.code(500).send({ error: "internal_error", requestId: request.id });
  });

  app.addHook("onClose", async () => pool.end());
  return app;
}
