export function diffPrice(row1, row2) {
  const GAP_ALERT = 0.001; // 0.1%
  if (row1.p > row2.p) {
    const spread = (row1.p - row2.p) / row2.p;
    if (spread >= GAP_ALERT) {
      return {
        Buy: row2.dex,
        Sell: row1.dex,
        Pair: `${row2.symbB}/${row2.symbQ}`,
        SpreadPct: spread,
      };
    }
  }
  if (row1.p < row2.p) {
    const spread = (row2.p - row1.p) / row1.p;
    if (spread >= GAP_ALERT) {
      return({
        Buy: row1.dex,
        Sell: row2.dex,
        Pair: `${row1.symbB}/${row1.symbQ}`,
        SpreadPct: spread,
      });
    }
  }
  return null;
}