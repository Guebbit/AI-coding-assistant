import mysql from "mysql2/promise";
import type { Tool } from "./types";

/**
 * MySQL query tool — read-only SELECT queries only.
 *
 * Connection settings are read from environment variables:
 *   MYSQL_HOST      (default: localhost)
 *   MYSQL_PORT      (default: 3306)
 *   MYSQL_USER      (default: root)
 *   MYSQL_PASSWORD  (default: empty)
 *   MYSQL_DATABASE  (default: empty)
 */
export const mysqlQueryTool: Tool = {
  name: "mysql_query",
  description:
    "Execute a read-only SELECT query against MySQL. " +
    "Input: { sql: string, params?: unknown[] }",

  async execute({ sql, params }) {
    if (typeof sql !== "string" || sql.trim() === "") {
      throw new Error('"sql" must be a non-empty string');
    }

    // Safety: only allow SELECT statements to prevent mutations
    if (!/^\s*SELECT\b/i.test(sql)) {
      throw new Error(
        "Only SELECT queries are permitted. Received: " + sql.slice(0, 80)
      );
    }

    const connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST ?? "localhost",
      port: parseInt(process.env.MYSQL_PORT ?? "3306", 10),
      user: process.env.MYSQL_USER ?? "root",
      password: process.env.MYSQL_PASSWORD ?? "",
      database: process.env.MYSQL_DATABASE ?? "",
      // Never allow multi-statement execution
      multipleStatements: false,
    });

    try {
      const queryParams = Array.isArray(params) ? params : [];
      const [rows] = await connection.execute(sql, queryParams);
      return rows;
    } finally {
      await connection.end();
    }
  },
};
