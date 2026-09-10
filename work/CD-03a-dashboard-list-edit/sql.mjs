// CD-03a evidence helper: run a read-only or maintenance SQL statement against
// the same database the app uses. `psql` is not installed on this machine.
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const stmt = process.argv.slice(2).join(" ");
const rows = await sql.unsafe(stmt);
console.log(JSON.stringify(rows, null, 1));
await sql.end();
