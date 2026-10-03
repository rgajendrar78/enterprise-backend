import { HttpException, HttpStatus } from "@nestjs/common";
import { ERROR_CODE, ERROR_MESSAGE } from "@/common/constants/errors";

/** The errors a **client branches on**. One entry pins the code, the status and the
 *  sentence together, so they cannot drift; ordinary failures stay ordinary. */
export const APP_ERROR = {
  [ERROR_CODE.ACCOUNT_DISABLED]: {
    status: HttpStatus.FORBIDDEN,
    message: ERROR_MESSAGE.ACCOUNT_DISABLED,
  },
  [ERROR_CODE.INVALID_RESET_TOKEN]: {
    status: HttpStatus.BAD_REQUEST,
    message: ERROR_MESSAGE.INVALID_RESET_TOKEN,
  },
} as const;

export type AppErrorCode = keyof typeof APP_ERROR;

/** `throw new AppException(ERROR_CODE.X)` — nothing else to get right. Extends
 *  `HttpException`, and the filter lifts `errorCode` into the envelope and the log. */
export class AppException extends HttpException {
  constructor(errorCode: AppErrorCode, details?: unknown) {
    const { status, message } = APP_ERROR[errorCode];
    super({ message, errorCode, ...(details === undefined ? {} : { details }) }, status);
  }
}
