import { defineConfig } from "drizzle-kit";

// Every change Foundable applies to this website's database is recorded under drizzle/migrations as a custom SQL
// migration drizzle-kit prepares, so the database's history travels with the code. Foundable applies the changes
// itself; the URL below is only for `drizzle-kit migrate` against a database of your own.
export default defineConfig({
  dialect: "postgresql",
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
