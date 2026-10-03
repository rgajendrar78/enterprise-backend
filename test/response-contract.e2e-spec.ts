import { Body, Controller, Get, Module, NotFoundException, Post } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { IsEmail } from "class-validator";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import request from "supertest";
import { AllExceptionsFilter } from "@/common/filters/all-exceptions.filter";
import { ResponseInterceptor } from "@/common/interceptors/response.interceptor";
import { ResponseMessage } from "@/common/decorators";
import { paginate } from "@/common/utils/pagination.util";

class ProbeDto {
  @IsEmail()
  email: string;
}

@Controller("probe")
class ProbeController {
  @Get()
  @ResponseMessage("Fetched")
  list() {
    return paginate([{ id: 1 }], 1, 1, 20);
  }

  @Get("missing")
  missing() {
    throw new NotFoundException("Nothing here");
  }

  @Get("boom")
  boom() {
    throw new Error("leaky internal detail");
  }

  @Post()
  create(@Body() dto: ProbeDto) {
    return dto;
  }
}

@Module({
  controllers: [ProbeController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
class ProbeModule {}

describe("response contract", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
    // `logger: false`: one case throws on purpose, and the filter logging that stack
    // makes a passing suite look like a failing one.
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("unwraps a paginated result into data + meta", async () => {
    const { body } = await request(app.getHttpServer()).get("/probe").expect(200);
    expect(body).toEqual({
      success: true,
      message: "Fetched",
      data: [{ id: 1 }],
      meta: { page: 1, limit: 20, totalCount: 1, totalPages: 1 },
    });
  });

  it("maps an HttpException to the error envelope", async () => {
    const { body } = await request(app.getHttpServer()).get("/probe/missing").expect(404);
    expect(body).toMatchObject({
      success: false,
      message: "Nothing here",
      errorCode: "NOT_FOUND",
      path: "/probe/missing",
    });
  });

  it("replaces an unhandled error with a generic message", async () => {
    const { body } = await request(app.getHttpServer()).get("/probe/boom").expect(500);
    expect(body).toMatchObject({
      message: "Internal server error",
      errorCode: "INTERNAL_SERVER_ERROR",
    });
    // The stack rides along as `details` outside production only — see AllExceptionsFilter.
    expect(body.details).toContain("leaky internal detail");
  });

  it("reports validation failures as a details list", async () => {
    const { body } = await request(app.getHttpServer())
      .post("/probe")
      .send({ email: "nope", extra: 1 })
      .expect(400);
    expect(body.errorCode).toBe("VALIDATION_FAILED");
    expect(body.details).toEqual(expect.arrayContaining([expect.stringContaining("email")]));
  });
});
