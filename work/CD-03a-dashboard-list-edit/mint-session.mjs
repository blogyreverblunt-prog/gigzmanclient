/**
 * CD-03a evidence harness: mint a `gz_platform_session` cookie value.
 *
 * Identical claims, algorithm, secret and lifetime to `createPlatformSession`
 * in lib/platform-auth.ts — this only skips the browser round trip through the
 * login form, which curl cannot drive. It proves nothing about auth and is not
 * offered as evidence of anything; it is how the AUTHENTICATED half of the
 * evidence gets a session. The UNAUTHENTICATED half sends no cookie at all.
 */
import { SignJWT } from "jose";

const value = process.env.AUTH_SECRET;
if (!value || value.length < 16) throw new Error("AUTH_SECRET is not set");
const secret = new TextEncoder().encode(value);
const email = process.env.PLATFORM_ADMIN_EMAIL ?? "operator@example.com";

const token = await new SignJWT({ role: "platform-admin", email })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("3600s")
  .sign(secret);

process.stdout.write(`gz_platform_session=${token}`);
