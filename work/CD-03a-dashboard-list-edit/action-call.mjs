/**
 * CD-03a evidence harness: call a Server Action over HTTP exactly as a browser
 * would, so "unauthenticated POST is refused" is proved against the real
 * endpoint rather than against a rendered page.
 *
 * Uses React's own `encodeReply` from the copy of react-server-dom bundled with
 * this Next version, so the request body is byte-for-byte what the client
 * runtime sends. The response is the RSC flight stream, printed raw — the
 * action's return value (our `{ ok, message }`) appears in it verbatim.
 *
 * Usage:
 *   node work/.../action-call.mjs <url> <actionId> [--cookie <value>] k=v k=v ...
 */
import { encodeReply } from "next/dist/compiled/react-server-dom-turbopack/client.node.js";

const [, , url, actionId, ...rest] = process.argv;
if (!url || !actionId) {
  console.error("usage: action-call.mjs <url> <actionId> [--cookie <v>] key=value ...");
  process.exit(2);
}

let cookie = "";
const fields = [];
for (let i = 0; i < rest.length; i += 1) {
  if (rest[i] === "--cookie") {
    cookie = rest[i + 1] ?? "";
    i += 1;
  } else {
    const idx = rest[i].indexOf("=");
    fields.push([rest[i].slice(0, idx), rest[i].slice(idx + 1)]);
  }
}

const payload = new FormData();
for (const [k, v] of fields) payload.append(k, v);

const body = await encodeReply([payload]);
const headers = { "Next-Action": actionId };
if (cookie) headers.Cookie = cookie;
if (typeof body === "string") headers["Content-Type"] = "text/plain;charset=UTF-8";

const res = await fetch(url, { method: "POST", headers, body, redirect: "manual" });
const text = await res.text();

console.log("STATUS", res.status);
console.log("LOCATION", res.headers.get("location") ?? "-");
console.log("X-ACTION-REDIRECT", res.headers.get("x-action-redirect") ?? "-");
console.log("SET-COOKIE", res.headers.get("set-cookie") ?? "-");
console.log("--- body ---");
// The flight stream is long; the action's own return value is what matters.
const results = text.match(/\{"ok":(?:true|false)(?:,"message":"(?:[^"\\]|\\.)*")?\}/g);
console.log(
  results
    ? results.join("\n")
    : "(no ActionResult in the response — see X-ACTION-REDIRECT above)",
);
