# NestJS for Tenantory — Resources

## Knowledge

- [NestJS Providers (DI)](https://docs.nestjs.com/providers)
  The DI system: providers, injection tokens, scopes, custom providers. Use for: understanding how NestJS resolves dependency graphs.
- [NestJS Controllers](https://docs.nestjs.com/controllers)
  Request handling: decorators, parameter decorators, lifecycle hooks. Use for: building HTTP endpoints correctly.
- [NestJS Pipes](https://docs.nestjs.com/pipes)
  Input transformation and validation: built-in pipes (ValidationPipe, ParseIntPipe, etc.), custom pipes. Use for: every POST/PUT endpoint.
- [NestJS Guards](https://docs.nestjs.com/guards)
  Authentication and authorization: execution context, canActivate(), role guards. Use for: tenant isolation, auth checks.
- [NestJS Interceptors](https://docs.nestjs.com/interceptors)
  Response transformation, logging, caching, timeout: wrapping the response stream. Use for: response formatting, audit logging.
- [NestJS Exception Filters](https://docs.nestjs.com/exception-filters)
  Custom error handling: catch(), @Catch decorator, ArgumentsHost. Use for: your GlobalExceptionFilter.
- [NestJS Middleware](https://docs.nestjs.com/middleware)
  Express-compatible request processing: NestModule.configure(), MiddlewareConsumer. Use for: RequestIdMiddleware pattern.
- [NestJS + TypeORM](https://docs.nestjs.com/recipes/typeorm)
  Repository pattern: forFeature(), forRoot(), autoLoadEntities, custom repositories. Use for: every module that touches the database.
- [TypeORM Entity Metadata](https://typeorm.io/entities)
  Entity decorators, relations, column types, lifecycle hooks. Use for: designing new entities or understanding existing ones.
- [class-validator docs](https://github.com/typestack/class-validator)
  Validation decorators: @IsString, @IsUUID, @MinLength, @IsOptional, etc. Use for: DTO validation in every endpoint.
- [class-transformer docs](https://github.com/typestack/class-transformer)
  Transformation decorators: @Type, @Transform, @Exclude. Use for: converting plain objects to class instances.

## Wisdom (Communities)

- [NestJS Discord](https://discord.gg/nestjs)
  Official community. Active, well-moderated. Use for: troubleshooting DI issues, architectural questions.
- [r/nestjs](https://reddit.com/r/nestjs)
  Subreddit for NestJS developers. Use for: pattern discussions, module design critique.
- [TypeORM GitHub Discussions](https://github.com/typeorm/typeorm/discussions)
  TypeORM-specific questions. Use for: query builder patterns, migration issues.

## Gaps

- No high-quality resource found specifically covering multi-tenancy patterns in NestJS (shared-database, row-level filtering). This is a gap we address in Lesson 005 (Guards — Tenant Isolation).
- No single resource covers the complete NestJS request pipeline from middleware through filter in a unified way. We synthesize this across multiple docs pages.
