import pkg from 'pg';
const { Pool } = pkg;

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function store(row) {
  // row: { dex, base, quote, price, blockNumber }
  await pool.query(
    `INSERT INTO dex_prices(dex, base, quote, block_number, price_quote_in_base, price_base_in_quote)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [row.dex, row.symbB, row.symbQ, row.blockNumber, row.p, 1 / row.p]
  );
}

export async function storeOpp(row, blocknumber) {
  // row: { Pair, Buy, Sell, Spread }
  await pool.query(
    `INSERT INTO opportunities(block_number, pair, dex_buy, dex_sell, spread_pct)
     VALUES ($1,$2,$3,$4,$5)`,
    [blocknumber, row.Pair, row.Buy, row.Sell, row.SpreadPct]
  );
}