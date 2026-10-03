import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { env } from "@/config/env";

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle("Enterprise API")
    .setDescription("Every response uses the { success, message, data } envelope.")
    .setVersion("1.0")
    .addBearerAuth()
    .build();

  SwaggerModule.setup(`${env.API_PREFIX}/docs`, app, SwaggerModule.createDocument(app, config), {
    swaggerOptions: { persistAuthorization: true },
  });
}
