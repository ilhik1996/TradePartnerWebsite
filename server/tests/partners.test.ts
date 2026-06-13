import { describe, it, expect } from "vitest";
import { getPartners, getPartner } from "../modules/partners";

describe("getPartners", () => {
  it("returns an array", async () => {
    const result = await getPartners();
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns only active partners", async () => {
    const result = await getPartners();
    expect(result.every(p => p.isActive)).toBe(true);
  });

  it("returns all 12 partners globally when no countryId given", async () => {
    const result = await getPartners();
    expect(result.length).toBeGreaterThanOrEqual(12);
  });

  it("filters by countryId — includes global (null) partners", async () => {
    const result = await getPartners(1);
    // Global partners have countryId = null
    const globals = result.filter(p => p.countryId === null);
    expect(globals.length).toBeGreaterThan(0);
  });

  it("filters by countryId — excludes partners for other countries", async () => {
    // Ukraine (id=1) should not see US-only partners (countryId=2)
    const result = await getPartners(1);
    const usOnly = result.filter(p => p.countryId === 2);
    expect(usOnly).toHaveLength(0);
  });

  it("covers all 12 partner categories", async () => {
    const all = await getPartners();
    const categories = new Set(all.map(p => p.category));
    const required = ["food", "retail", "pharmacy", "telecom", "fuel", "entertainment",
      "electronics", "delivery", "beauty", "fitness", "travel", "finance"];
    for (const cat of required) {
      expect(categories.has(cat as any), `missing category: ${cat}`).toBe(true);
    }
  });

  it("all partners have positive cashbackPercent", async () => {
    const result = await getPartners();
    expect(result.every(p => p.cashbackPercent > 0)).toBe(true);
  });
});

describe("getPartner", () => {
  it("returns a partner by id", async () => {
    const p = await getPartner(1);
    expect(p).not.toBeNull();
    expect(p?.id).toBe(1);
  });

  it("returns null for non-existent id", async () => {
    const p = await getPartner(9999);
    expect(p).toBeNull();
  });

  it("returns partner with all required fields", async () => {
    const p = await getPartner(1);
    expect(p).toHaveProperty("id");
    expect(p).toHaveProperty("name");
    expect(p).toHaveProperty("category");
    expect(p).toHaveProperty("cashbackPercent");
    expect(p).toHaveProperty("isActive");
  });
});
