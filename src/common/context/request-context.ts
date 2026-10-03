import { AsyncLocalStorage } from "node:async_hooks";

interface RequestContext {
  requestId: string;
  userId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs the rest of the request inside a fresh context. Called from middleware, so
 *  guards, the handler and its writes all inherit the same store. */
export function runInRequestContext<T>(requestId: string, callback: () => T): T {
  return storage.run({ requestId }, callback);
}

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export function setCurrentUserId(userId: string): void {
  const context = storage.getStore();
  if (context) context.userId = userId;
}

/** Who is acting, or `undefined` outside an HTTP request (the seed, the CLI). Read by
 *  `AuditSubscriber` and by the rules that stop an admin locking themselves out. */
export function currentUserId(): string | undefined {
  return storage.getStore()?.userId;
}
