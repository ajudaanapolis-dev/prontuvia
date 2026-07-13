import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth.js";
import { requirePermission } from "../authorization.js";
import { config } from "../config.js";

type ClassificationSystem = "CID10" | "CID11";
type ClassificationItem = {
  system: ClassificationSystem;
  code: string;
  title: string;
  release: string;
  source: string;
};

let cid10CatalogPromise: Promise<ClassificationItem[]> | undefined;
let whoToken: { value: string; expiresAt: number } | undefined;

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function formatCid10(raw: string): string {
  const code = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length > 3 ? `${code.slice(0, 3)}.${code.slice(3)}` : code;
}

async function cid10Catalog(): Promise<ClassificationItem[]> {
  const catalogPath = fileURLToPath(new URL("../../../../data/cid10/CID-10-SUBCATEGORIAS.csv", import.meta.url));
  cid10CatalogPromise ??= readFile(catalogPath, "utf8").then((csv) =>
    csv.split(/\r?\n/).slice(1).flatMap((line) => {
      if (!line.trim()) return [];
      const fields = line.split(";");
      const code = formatCid10(fields[0] ?? "");
      const title = (fields[4] ?? "").trim();
      if (!code || !title) return [];
      return [{ system: "CID10" as const, code, title, release: "DATASUS-2008", source: "DATASUS" }];
    }),
  );
  return cid10CatalogPromise;
}

function rank(item: ClassificationItem, query: string): number {
  const q = normalize(query).replace(/\s+/g, " ").trim();
  const code = normalize(item.code);
  const title = normalize(item.title);
  if (code === q) return 0;
  if (code.startsWith(q)) return 1;
  if (title.startsWith(q)) return 2;
  if (title.includes(q)) return 3;
  const terms = q.split(" ").filter(Boolean);
  return terms.every((term) => title.includes(term)) ? 4 : 99;
}

export async function searchCid10(query: string, limit = 10): Promise<ClassificationItem[]> {
  const items = await cid10Catalog();
  return items
    .map((item) => ({ item, score: rank(item, query) }))
    .filter(({ score }) => score < 99)
    .sort((a, b) => a.score - b.score || a.item.code.localeCompare(b.item.code))
    .slice(0, limit)
    .map(({ item }) => item);
}

function stripMarkup(value: unknown): string {
  return String(value ?? "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

async function getWhoToken(): Promise<string> {
  if (!config.WHO_ICD_CLIENT_ID || !config.WHO_ICD_CLIENT_SECRET) throw new Error("who_icd_not_configured");
  if (whoToken && whoToken.expiresAt > Date.now() + 30_000) return whoToken.value;
  const body = new URLSearchParams({
    client_id: config.WHO_ICD_CLIENT_ID,
    client_secret: config.WHO_ICD_CLIENT_SECRET,
    scope: "icdapi_access",
    grant_type: "client_credentials",
  });
  const response = await fetch("https://icdaccessmanagement.who.int/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error("who_icd_authentication_failed");
  const payload = await response.json() as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error("who_icd_authentication_failed");
  whoToken = { value: payload.access_token, expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000 };
  return whoToken.value;
}

async function searchCid11(query: string, limit = 10): Promise<ClassificationItem[]> {
  const token = await getWhoToken();
  const release = config.WHO_ICD_RELEASE;
  const url = new URL(`https://id.who.int/icd/release/11/${release}/mms/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("useFlexisearch", "true");
  url.searchParams.set("flatResults", "true");
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Accept-Language": config.WHO_ICD_LANGUAGE,
      "API-Version": "v2",
    },
  });
  if (!response.ok) throw new Error("who_icd_search_failed");
  const payload = await response.json() as {
    destinationEntities?: Array<{ theCode?: string; code?: string; title?: string; label?: string }>;
  };
  return (payload.destinationEntities ?? []).flatMap((entity) => {
    const code = stripMarkup(entity.theCode ?? entity.code);
    const title = stripMarkup(entity.title ?? entity.label);
    if (!code || !title) return [];
    return [{ system: "CID11" as const, code, title, release, source: "OMS" }];
  }).slice(0, limit);
}

const searchQuery = z.object({
  system: z.enum(["CID10", "CID11"]),
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

const counterpartInput = z.object({
  sourceSystem: z.enum(["CID10", "CID11"]),
  code: z.string().trim().min(1).max(40),
  title: z.string().trim().min(2).max(500),
});

export async function classificationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/search", { preHandler: [requirePermission("records.read")] }, async (request, reply) => {
    const input = searchQuery.parse(request.query);
    try {
      const items = input.system === "CID10"
        ? await searchCid10(input.q, input.limit)
        : await searchCid11(input.q, input.limit);
      return { items, configured: input.system === "CID10" || Boolean(config.WHO_ICD_CLIENT_ID && config.WHO_ICD_CLIENT_SECRET) };
    } catch (error) {
      const code = error instanceof Error ? error.message : "classification_search_failed";
      if (code === "who_icd_not_configured") return reply.code(503).send({ error: code });
      request.log.warn({ err: error, system: input.system }, "classification search failed");
      return reply.code(502).send({ error: code });
    }
  });

  app.post("/suggest-counterpart", { preHandler: [requirePermission("records.read")] }, async (request, reply) => {
    const input = counterpartInput.parse(request.body);
    try {
      const candidates = input.sourceSystem === "CID10"
        ? await searchCid11(input.title, 3)
        : await searchCid10(input.title, 3);
      return {
        item: candidates[0] ?? null,
        status: candidates[0] ? "suggested" : "not_found",
        warning: "Correspondência terminológica sugerida; CID-10 e CID-11 não possuem relação obrigatoriamente unívoca. Revise antes de finalizar.",
      };
    } catch (error) {
      const code = error instanceof Error ? error.message : "classification_mapping_failed";
      if (code === "who_icd_not_configured") return reply.code(503).send({ error: code });
      request.log.warn({ err: error, sourceSystem: input.sourceSystem }, "classification counterpart failed");
      return reply.code(502).send({ error: code });
    }
  });
}
