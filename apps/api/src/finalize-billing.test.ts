import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const records=readFileSync("apps/api/src/routes/records.ts","utf8");

describe("faturamento ao finalizar atendimento",()=>{
 it("tipa valores monetários como numeric no PostgreSQL",()=>{
  expect(records).toContain("$6::numeric");
  expect(records).toContain("$7::numeric");
  expect(records).toContain("$8::numeric");
  expect(records).toContain("$8::numeric>0::numeric");
 });
});
