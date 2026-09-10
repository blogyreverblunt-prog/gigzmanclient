// AC 6 (b): the cap branch, probed as a pure function so the fourth-tenant
// refusal never has to be created in the database.
import { vastuDecision, VASTU_TENANT_CAP, VASTU_ROUTES_PER_TENANT } from "../../lib/platform/feature-copy";
console.log("cap =", VASTU_TENANT_CAP, "routes/tenant =", VASTU_ROUTES_PER_TENANT);
console.log("0 enabled, no ack :", JSON.stringify(vastuDecision([], false)));
console.log("0 enabled, ack    :", JSON.stringify(vastuDecision([], true)));
console.log("1 enabled, no ack :", JSON.stringify(vastuDecision(["high-properties"], false)));
console.log("1 enabled, ack    :", JSON.stringify(vastuDecision(["high-properties"], true)));
console.log("3 enabled, ack    :", JSON.stringify(vastuDecision(["a","b","c"], true)));
