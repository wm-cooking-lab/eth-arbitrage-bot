import 'dotenv/config';
import { ethers } from 'ethers';
import pkg from 'pg';
const { Pool } = pkg;

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

const DEXES = [
  { dex: 'uniswap-v2',   proto: 'v2', factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f' }, // Uni V2
  { dex: 'sushiswap-v2', proto: 'v2', factory: '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac' }, // Sushi V2
  { dex: 'uniswap-v3-500',  proto: 'v3', factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984', fee: 500 },
  { dex: 'uniswap-v3-3000', proto: 'v3', factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984', fee: 3000 },
];

const V2_FACTORY_ABI = ['function getPair(address,address) view returns (address)'];
const V3_FACTORY_ABI = ['function getPool(address,address,uint24) view returns (address)'];


// sorted lexicographically
const TOKENS = {
  SHIB: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
  USDC: '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
};

/* const PAIRS = [
  { base: TOKENS.WETH, quote: TOKENS.USDC }, // ETH/USD
  { base: TOKENS.WBTC, quote: TOKENS.USDC }, // BTC/USD
  { base: TOKENS.SHIB, quote: TOKENS.USDC }, // SHIB/USD
]; */

// ABI utilitaire pour interroger n'importe quel token ERC-20
const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];


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

async function fetchSpotPriceV2(factoryAddress, baseAddress, quoteAddress) {

  const factory = new ethers.Contract(factoryAddress, V2_FACTORY_ABI, provider);
  const pairAddress = await factory.getPair(baseAddress, quoteAddress);

  if (!pairAddress || pairAddress === ethers.ZeroAddress) {
    throw new Error("Pair does not exist on this DEX");
  }
  const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
  const [t0,t1,reserves, blockNumber] = await Promise.all([pair.token0(),pair.token1(),pair.getReserves(),provider.getBlockNumber()]);

const [dec0, dec1] = await Promise.all([
    new ethers.Contract(baseAddress, ERC20_ABI, provider).decimals(),new ethers.Contract(quoteAddress, ERC20_ABI, provider).decimals(),
]);
  const Res1  = parseFloat(ethers.formatUnits(reserves.reserve1, dec1));  
  const Res0  = parseFloat(ethers.formatUnits(reserves.reserve0, dec0));  
  if (t0.toLowerCase() === baseAddress.toLowerCase()) {
      const price = Res0/Res1;
} else {
    const price = Res1/Res0;
}
  return { price, blockNumber };
}

async function fetchSpotPriceETHUSDC_V3(factoryAddress, baseAddress, quoteAddress, fee) {

  const factory = new ethers.Contract(factoryAddress, V3_FACTORY_ABI, provider);
  const poolAddress = await factory.getPool(baseAddress, quoteAddress, fee);
  if (!poolAddress || poolAddress === ethers.ZeroAddress) {
    throw new Error("Pool does not exist on this DEX");
  }

  const poolV3 = new ethers.Contract(poolAddress, V3_POOL_ABI, provider);
  
  const [t0, t1, slot, blockNumber] = await Promise.all([
    poolV3.token0(), poolV3.token1(), poolV3.slot0(), provider.getBlockNumber()
  ]);

  const [dec0, dec1] = await Promise.all([
    new ethers.Contract(t0, ERC20_ABI, provider).decimals(),
    new ethers.Contract(t1, ERC20_ABI, provider).decimals(),
  ]);

  const sqrtX96 = BigInt(slot.sqrtPriceX96);
  const Q192 = (1n << 192n); // 2^192

  let num = sqrtX96 * sqrtX96; // BigInt
  let den = Q192;              

  const decDiff = BigInt(Number(dec0) - Number(dec1));
  if (decDiff > 0n) {
    den /= 10n ** decDiff;
  } else if (decDiff < 0n) {
    den *= 10n ** (-decDiff);
  }

  let price;
  if (t0.toLowerCase() === baseAddress.toLowerCase()) {
    price = Number(num) / Number(den);
  } else {
    price = Number(den) / Number(num);
  }
  return { price, blockNumber };
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
