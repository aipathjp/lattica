import { neon } from '@neondatabase/serverless';

/**
 * Returns the dummy `sales_records` rows from the Neon demo database as JSON.
 *
 * The connection string comes from the `DATABASE_URL` environment variable
 * (`.env.local` locally, a Vercel project env var in production) — never
 * hard-coded. The route is forced dynamic so it reads the env and queries at
 * request time rather than being statically evaluated at build.
 */
export const dynamic = 'force-dynamic';

export interface SaleRow {
  id: number;
  region: string;
  category: string;
  product: string;
  sales_rep: string;
  units: number;
  unit_price: number;
  order_date: string;
  active: boolean;
}

export async function GET(): Promise<Response> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return Response.json(
      { error: 'DATABASE_URL is not configured' },
      { status: 500 },
    );
  }

  try {
    const sql = neon(url);
    const rows = (await sql`
      SELECT id, region, category, product, sales_rep,
             units, unit_price::float8 AS unit_price,
             to_char(order_date, 'YYYY-MM-DD') AS order_date, active
      FROM sales_records
      ORDER BY id
    `) as SaleRow[];
    return Response.json({ rows });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
