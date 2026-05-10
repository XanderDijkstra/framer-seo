import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is not set — copy .env.example to .env.local and fill in your Neon connection string.",
  );
}

const client = neon(url);
export const db = drizzle(client, { schema });
export { schema };
