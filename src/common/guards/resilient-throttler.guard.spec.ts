import { Logger } from "@nestjs/common";
import { ThrottlerException, ThrottlerGuard } from "@nestjs/throttler";
import { ResilientThrottlerGuard } from "@/common/guards/resilient-throttler.guard";

type HandleRequest = (request: unknown) => Promise<boolean>;

const parent = ThrottlerGuard.prototype as unknown as { handleRequest: HandleRequest };

describe("ResilientThrottlerGuard", () => {
  const guard = new ResilientThrottlerGuard({} as never, {} as never, {} as never) as unknown as {
    handleRequest: HandleRequest;
  };

  afterEach(() => jest.restoreAllMocks());

  it("still rejects a genuine rate-limit breach", async () => {
    jest.spyOn(parent, "handleRequest").mockRejectedValue(new ThrottlerException());
    await expect(guard.handleRequest({})).rejects.toThrow(ThrottlerException);
  });

  it("allows the request when the storage backend is unreachable, and says so", async () => {
    // The warning is the point: a rate limiter that fails open silently is a
    // rate limiter nobody knows is off.
    const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    jest.spyOn(parent, "handleRequest").mockRejectedValue(new Error("Stream isn't writeable"));

    await expect(guard.handleRequest({})).resolves.toBe(true);

    expect(warn).toHaveBeenCalled();
  });
});
