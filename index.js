import 'dotenv/config';
import { ethers } from 'ethers';
import pkg from 'pg';
const { Pool } = pkg;

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

const DEXES = [
  { name: 'uniswap-v2',     pairAddress: '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc' },
  { name: 'sushiswap-v2',   pairAddress: '0x397FF1542f962076d0BFE58eA045FfA2d347ACa0' },
  { name: 'uniswap-v3-500',  pairAddress: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640' }, // 0.05%
  { name: 'uniswap-v3-3000', pairAddress: '0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8' }  // 0.30%
];

// En minuscule pour le ===
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'.toLowerCase();
const USDC = '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'.toLowerCase();
const DEC_WETH = 18, DEC_USDC = 6;

const PAIR_ABI = [
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
];

const V3_POOL_ABI = [
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)',
  'function token0() view returns (address)',
  'function token1() view returns (address)'
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function store(row) {
  await pool.query(
    `INSERT INTO dex_prices(dex, pair, block_number, price_eth_usdc, price_usdc_eth)
     VALUES ($1,$2,$3,$4,$5)`,
    [row.dex, 'WETH/USDC', row.blockNumber, row.priceETH_USDC, row.priceUSDC_ETH]
  );
}

async function fetchSpotPriceETHUSDC(pairAddress) {
  const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
  const [reserves, blockNumber] = await Promise.all([
    pair.getReserves(),
    provider.getBlockNumber()
  ]);

  const ethRes  = parseFloat(ethers.formatUnits(reserves.reserve1, DEC_WETH));  // WETH = token1
  const usdcRes = parseFloat(ethers.formatUnits(reserves.reserve0, DEC_USDC));  // USDC = token0
  const priceETH_USDC = usdcRes / ethRes; // USDC pour 1 ETH
 
  return { priceETH_USDC, blockNumber };
}

async function fetchSpotPriceETHUSDC_V3(poolAddress) {
  const poolV3 = new ethers.Contract(poolAddress, V3_POOL_ABI, provider);
  const [t0, t1, slot, blockNumber] = await Promise.all([
    poolV3.token0(), poolV3.token1(), poolV3.slot0(), provider.getBlockNumber()
  ]);

  const sqrtX96 = BigInt(slot.sqrtPriceX96);
  const Q192 = (1n << 192n); // 2^192

  let num = sqrtX96 * sqrtX96; // BigInt
  let den = Q192 *10n ** BigInt(DEC_WETH-DEC_USDC);         // BigInt

  let priceETH_USDC = Number(den) / Number(num); // token0 per 1 token1
  return {priceETH_USDC, blockNumber };
}

async function tick() {
  try {
    const out = [];
    for (const d of DEXES) {
      const p = d.name.startsWith('uniswap-v3')
        ? await fetchSpotPriceETHUSDC_V3(d.pairAddress)
        : await fetchSpotPriceETHUSDC(d.pairAddress);
      const row = { dex: d.name, ...p };
      out.push(row);
      await store(row);
    }
    console.log(
      out.map(x => `${x.dex}:${x.priceETH_USDC.toFixed(4)} USDC/ETH @#${x.blockNumber}`).join(' | ')
    );

    /* // (Optionnel) calcul d'écart :
    const GAP_ALERT = 0.005; // 0.5%
    const a = out[0], b = out[1];
    const pct = b.priceETH_USDC / a.priceETH_USDC - 1;
    if (Math.abs(pct) >= GAP_ALERT) {
      const s = pct >= 0 ? '+' : '';
      console.log(`ECART ${s}${(pct*100).toFixed(2)}% — ${b.dex} vs ${a.dex}`);
    }
    */
  } catch (e) {
    console.error('tick:', e.message);
  }
}

async function main() {
  let lastBlock = 0;

  // Petit log + tick initial pour valider la connexion
  const current = await provider.getBlockNumber();
  console.log('Démarré. Bloc actuel :', current);
  await tick();

  // écoute en continu les nouveaux blocs
  provider.on('block', async (blockNumber) => {
    if (blockNumber !== lastBlock) {
      lastBlock = blockNumber;
      console.log('Nouveau bloc :', blockNumber);
      await tick();
    }
  });

  // (facultatif) capter les erreurs provider
  provider.on('error', (err) => console.error('provider error:', err?.message || err));
}

process.on('SIGINT', async () => { await pool.end().catch(()=>{}); process.exit(0); });
main().catch(e => { console.error(e); process.exit(1); });
