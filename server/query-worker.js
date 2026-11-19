import { parentPort, workerData } from "node:worker_threads";
import initSqlJs from "sql.js/dist/sql-wasm-inline.js";

const SQL = await initSqlJs();
const db = new SQL.Database();
// Bound SQLite allocations as well as the worker's JS heap and query deadline.
db.run("PRAGMA hard_heap_limit=67108864");
const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
const roots = new Map();
for (const [name, table] of Object.entries(workerData)) {
  const fields = [
    ...new Set(table.rows.flatMap((row) => Object.keys(row))),
  ].sort();
  if (!fields.length) fields.push("id");
  db.run(`CREATE TABLE ${quote(name)} (${fields.map(quote).join(",")})`);
  const insert = db.prepare(
    `INSERT INTO ${quote(name)} VALUES (${fields.map(() => "?").join(",")})`,
  );
  db.run("BEGIN");
  for (const row of table.rows)
    insert.run(
      fields.map((field) => {
        const value = row[field];
        return value == null
          ? null
          : typeof value === "boolean"
            ? Number(value)
            : typeof value === "object"
              ? JSON.stringify(value)
              : value;
      }),
    );
  db.run("COMMIT");
  insert.free();
}
for (const row of db.exec(
  "SELECT name, rootpage FROM sqlite_master WHERE type='table'",
)[0].values)
  roots.set(row[1], row[0]);
db.run("PRAGMA query_only=ON");
parentPort.postMessage({ ready: true });
parentPort.on("message", ({ sql, offset }) => {
  let stmt;
  try {
    if (typeof sql !== "string" || !/^\s*(SELECT|WITH)\b/i.test(sql))
      throw new Error("Use a single SELECT or WITH query.");
    // Preparing all statements before executing any prevents statement stacking.
    const statements = [...db.iterateStatements(sql)];
    if (statements.length !== 1) {
      statements.forEach((s) => s.free());
      throw new Error("Use one query at a time.");
    }
    // iterateStatements frees its statements on completion; prepare a fresh one.
    stmt = db.prepare(sql);
    const plan = db.exec(`EXPLAIN ${sql}`)[0]?.values || [];
    const tables = [
      ...new Set(
        plan
          .filter((row) => row[1] === "OpenRead")
          .map((row) => roots.get(row[3]))
          .filter(Boolean),
      ),
    ];
    const rows = [];
    let skipped = 0;
    while (skipped < offset) {
      if (!stmt.step()) {
        parentPort.postMessage({
          rows: [],
          offset,
          has_more: false,
          next_offset: null,
          tables,
        });
        return;
      }
      skipped++;
    }
    while (rows.length < 100 && stmt.step()) rows.push(stmt.getAsObject());
    const has_more = rows.length === 100 && stmt.step();
    const result = {
      rows,
      offset,
      has_more,
      next_offset: has_more ? offset + rows.length : null,
      tables,
    };
    if (JSON.stringify(result).length > 512_000)
      throw new Error(
        "Result is too wide. Select fewer columns or extract specific JSON fields; no rows were returned.",
      );
    parentPort.postMessage(result);
  } catch (error) {
    parentPort.postMessage({ error: String(error.message).slice(0, 300) });
  } finally {
    stmt?.free();
  }
});
