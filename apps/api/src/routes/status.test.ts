import { describe, expect, it } from "vitest";
import { serializeStatusTimestamp } from "./status.js";

describe("serializeStatusTimestamp", () => {
  it("treats timezone-less PostgreSQL aggregate timestamps as UTC", () => {
    expect(serializeStatusTimestamp("2026-08-10 07:01:40.21"))
      .toBe("2026-08-10T07:01:40.210Z");
  });

  it("preserves Date and timezone-aware values", () => {
    expect(serializeStatusTimestamp(new Date("2026-08-10T07:01:40.210Z")))
      .toBe("2026-08-10T07:01:40.210Z");
    expect(serializeStatusTimestamp("2026-08-10 08:01:40.21+01"))
      .toBe("2026-08-10T07:01:40.210Z");
  });

  it("returns null for missing or invalid values", () => {
    expect(serializeStatusTimestamp(null)).toBeNull();
    expect(serializeStatusTimestamp("not-a-date")).toBeNull();
  });
});
