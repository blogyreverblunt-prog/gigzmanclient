/**
 * CD-03a evidence harness for AC 8: post the public lead form's Server Action
 * directly, with no session of any kind, at a tenant's own contact URL.
 *
 * `submitQuery` takes (prevState, formData), so the reply carries two arguments.
 * Usage: node lead-post.mjs <tenantContactUrl> <actionId>
 */
import { encodeReply } from "next/dist/compiled/react-server-dom-turbopack/client.node.js";

const [, , url, actionId] = process.argv;

const fd = new FormData();
fd.append("name", "CD-03a evidence probe");
fd.append("phone", "9811111111");
fd.append("message", "AC 8: a deactivated tenant must not have a lead written on its behalf.");
fd.append("consent", "on");

const body = await encodeReply([{ ok: false }, fd]);
const headers = { "Next-Action": actionId };
if (typeof body === "string") headers["Content-Type"] = "text/plain;charset=UTF-8";

const res = await fetch(url, { method: "POST", headers, body, redirect: "manual" });
const text = await res.text();
console.log("STATUS", res.status, "X-ACTION-REDIRECT", res.headers.get("x-action-redirect") ?? "-");
const results = text.match(/\{"ok":(?:true|false)[^}]*\}/g);
console.log(results ? results.join("\n") : "(no QueryFormState in the response)");
