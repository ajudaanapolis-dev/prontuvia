import { describe, expect, it } from "vitest";
import { corsMethods } from "./cors.js";

describe("browser CORS contract", () => {
  it("allows every HTTP method used by the web application", () => {
    expect(corsMethods).toEqual(expect.arrayContaining(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]));
  });

  it("keeps procedure editing available through PUT", () => {
    expect(corsMethods).toContain("PUT");
  });
});
