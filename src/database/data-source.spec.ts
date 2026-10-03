import { dataSourceOptions } from "@/database/data-source";

describe("data source", () => {
  it("never auto-syncs the schema", () => {
    expect(dataSourceOptions.synchronize).toBe(false);
  });
});
