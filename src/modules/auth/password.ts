import "server-only";
import argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { AppError } from "@/shared/server/errors";

export const passwordOptions = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 };
export const hashPassword = (password: string) => argon2.hash(password, passwordOptions);
let dummyHash: Promise<string> | undefined;
export function dummyPasswordHash() { return dummyHash ??= hashPassword(randomBytes(32).toString("base64url")); }
export const verifyPassword = (hash: string, password: string) => argon2.verify(hash, password);
let active = 0;
// Ограничение RAM дополняет распределённые счётчики БД, не заменяя их.
export async function boundedLogin<T>(action: () => Promise<T>): Promise<T> {
  if (active >= 2) throw new AppError(429, "RATE_LIMITED", "Слишком много попыток. Повторите позже.", 1);
  active++;
  try { return await action(); } finally { active--; }
}
