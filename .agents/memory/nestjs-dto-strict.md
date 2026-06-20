---
name: NestJS DTO strict TS
description: How to handle strictPropertyInitialization with class-validator DTOs in NestJS
---

All class-validator DTO properties must use the `!` definite assignment assertion when TypeScript strict mode is on (strictPropertyInitialization: true).

```ts
class CreateUserDto {
  @IsString() name!: string;
  @IsEmail() email!: string;
}
```

**Why:** TypeScript strict mode flags uninitialized class properties. NestJS DTOs are plain classes that get populated by the ValidationPipe at runtime — they never go through a constructor, so TypeScript can't prove they'll be initialized.

**How to apply:** Add `!` to every DTO property decorated with class-validator decorators. Do this in controllers (inline body classes) and in `src/*/dto/*.ts` files.
