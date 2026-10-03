import { dateRange } from "@/common/utils/date-range.util";

const bounds = (operator: ReturnType<typeof dateRange>) => {
  const value = (operator as unknown as { value: Date | Date[] }).value;
  return (Array.isArray(value) ? value : [value]).map((date) => date.toISOString());
};

describe("dateRange", () => {
  it("is undefined when neither bound was sent, so nothing is filtered", () => {
    expect(dateRange(undefined, undefined)).toBeUndefined();
  });

  // A date names a whole day. Taking it bare would mean "created at 00:00:00 exactly",
  // which quietly excludes everyone who signed up during business hours.
  it("covers the whole day at both ends", () => {
    expect(bounds(dateRange("2026-01-05", "2026-01-06"))).toEqual([
      "2026-01-05T00:00:00.000Z",
      "2026-01-06T23:59:59.999Z",
    ]);
  });

  it("takes the start of the day when only `from` is sent", () => {
    expect(bounds(dateRange("2026-01-05", undefined))).toEqual(["2026-01-05T00:00:00.000Z"]);
  });

  it("takes the end of the day when only `to` is sent", () => {
    expect(bounds(dateRange(undefined, "2026-01-05"))).toEqual(["2026-01-05T23:59:59.999Z"]);
  });

  // Same day both ends is a single-day filter, not an empty result.
  it("still matches when both bounds are the same day", () => {
    expect(bounds(dateRange("2026-01-05", "2026-01-05"))).toEqual([
      "2026-01-05T00:00:00.000Z",
      "2026-01-05T23:59:59.999Z",
    ]);
  });
});
