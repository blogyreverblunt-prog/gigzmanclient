// AC 9 probe: tenantSlugForHost must never return a function.
import { tenantSlugForHost } from "../../lib/domains";
for (const h of ["constructor","Constructor:3000","__proto__","toString","hasOwnProperty","highproperties.in","www.highproperties.in","unknown.example"]) {
  const v = tenantSlugForHost(h);
  console.log(h, "->", typeof v, JSON.stringify(v));
}
