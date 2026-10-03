import type { NextFunction, Request, Response } from "express";
import { LOGGING } from "@/common/constants/runtime";
import { currentRequestId } from "@/common/context/request-context";
import { RequestContextMiddleware } from "@/common/middleware/request-context.middleware";

const middleware = new RequestContextMiddleware();

function run(incoming?: string | string[]): { id: string; echoed: unknown } {
  const setHeader = jest.fn();
  const request = { headers: { [LOGGING.REQUEST_ID_HEADER]: incoming } } as unknown as Request;
  const response = { setHeader } as unknown as Response;

  let id = "";
  middleware.use(request, response, (() => {
    id = currentRequestId() ?? "";
  }) as NextFunction);

  return { id, echoed: setHeader.mock.calls[0]?.[1] };
}

describe("RequestContextMiddleware", () => {
  it("keeps the caller's id, so one trace spans browser and API", () => {
    // The shape the frontend's `createRequestId` sends. If this ever stops
    // matching, both sides log different ids for the same request.
    const { id, echoed } = run("0f8fad5b-d9cb-469f-a165-70867728950e");

    expect(id).toBe("0f8fad5b-d9cb-469f-a165-70867728950e");
    expect(echoed).toBe(id);
  });

  it.each([
    ["a header with control characters", "abc\ninjected level=error"],
    ["one longer than any real trace id", "x".repeat(65)],
    ["an empty header", ""],
    ["no header at all", undefined],
  ])("replaces %s rather than logging it", (_case, incoming) => {
    const { id } = run(incoming);

    expect(id).not.toBe(incoming);
    expect(id).toMatch(/^[\w-]{1,64}$/);
  });

  it("takes the first value when a proxy sent the header twice", () => {
    expect(run(["first-id", "second-id"]).id).toBe("first-id");
  });
});
