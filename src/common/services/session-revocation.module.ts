import { Global, Module } from "@nestjs/common";
import { SessionRevocationService } from "@/common/services/session-revocation.service";

/** Global because both ends need it: the guard on every request, and any module whose
 *  writes invalidate a session. Anything else would be a circular import. */
@Global()
@Module({
  providers: [SessionRevocationService],
  exports: [SessionRevocationService],
})
export class SessionRevocationModule {}
