import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { RequestContextMiddleware } from "@/common/middleware/request-context.middleware";

/** Must be the **first** import in `AppModule`. Nest registers middleware in
 *  import order, and the logger has to run inside the store or lines lose `requestId`. */
@Module({})
export class RequestContextModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes("*path");
  }
}
