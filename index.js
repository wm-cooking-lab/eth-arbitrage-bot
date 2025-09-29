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

const TOKENS = {
  SHIB: { address: '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce', decimals: 18 },
  USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
  WBTC: { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8 },
  WETH: { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
};


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

const PAIRS = [
  [TOKENS.WETH, TOKENS.USDC],
  [TOKENS.WBTC, TOKENS.USDC],
  [TOKENS.SHIB, TOKENS.USDC],
];


const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function store(row) {
  // row: { dex, base, quote, price, blockNumber }
  await pool.query(
    `INSERT INTO dex_prices(dex, base, quote, block_number, price_base_quote, price_quote_base)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [row.dex, row.symbB, row.symbQ, row.blockNumber, row.price, 1 / row.price]
  );
}

async function fetchSpotPriceV2(factoryAddress, baseAddress, quoteAddress,decBase, decQuote) {

// Normalize all input addresses to checksum format
  const f = ethers.getAddress(factoryAddress);
  const base  = ethers.getAddress(baseAddress);
  const quote = ethers.getAddress(quoteAddress);

  const factory = new ethers.Contract(f, V2_FACTORY_ABI, provider);
  const pairAddress = await factory.getPair(base, quote);
  if (!pairAddress || pairAddress === ethers.ZeroAddress) {
    return null;
  }

  const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
  const reserves = await (pair.getReserves());

  let ResBase, ResQuote;
// Uniswap V2/V3 (and most forks): token0 = min(addressA, addressB) by numeric address (uint160)
  if (BigInt(base)<BigInt(quote))
  {
    ResBase = parseFloat(ethers.formatUnits(reserves.reserve0, decBase));
    ResQuote = parseFloat(ethers.formatUnits(reserves.reserve1, decQuote));
  }
  else {
    ResBase = parseFloat(ethers.formatUnits(reserves.reserve1, decBase));
    ResQuote = parseFloat(ethers.formatUnits(reserves.reserve0, decQuote));
  }
  let price = ResQuote / ResBase;
  return { price};
}



async function fetchSpotPriceETHUSDC_V3(factoryAddress, baseAddress, quoteAddress, decBase, decQuote, fee) {

  const f = ethers.getAddress(factoryAddress);
  const base  = ethers.getAddress(baseAddress);
  const quote = ethers.getAddress(quoteAddress);

  const factory = new ethers.Contract(f, V3_FACTORY_ABI, provider);
  const poolAddress = await factory.getPool(base, quote, fee);
  if (!poolAddress || poolAddress === ethers.ZeroAddress) {
    return null;
  }

  const poolV3 = new ethers.Contract(poolAddress, V3_POOL_ABI, provider);
  const slot = await (poolV3.slot0());

  const sqrtX96 = slot.sqrtPriceX96; //BigInt
  const Q192 = (1n << 192n); // 2^192

  let num = sqrtX96 * sqrtX96; 
  let den = Q192;
  let price;

  // Price1/0=(sqrt^2 / 2^192) * 10^(dec0 - dec1)
  if (BigInt(base)<BigInt(quote)) { // Base = token 0
    price = Number(num)/Number(den)*10**(decBase-decQuote) ;
  } else {  //Base = token 1 
    price = Number(den)/Number(num)*10**(decBase-decQuote);
  }
  return { price};
}

async function tick() {
  try {
    const out = [];
    const blockNumber = await provider.getBlockNumber(); 
    for (const [base, quote] of PAIRS) {
      for (const d of DEXES) {
        try {
          const p = d.proto === 'v3'
            ? await fetchSpotPriceETHUSDC_V3(d.factory, base, quote, d.fee)
            : await fetchSpotPriceV2(d.factory, base, quote);

          if (!p || !Number.isFinite(p.price)) continue; 

          const symbQ =Object.entries(TOKENS).find(([, addr]) => addr === quote)?. [0] ?? "UNKNOWN";
          const symbB =Object.entries(TOKENS).find(([, addr]) => addr === base)?. [0] ?? "UNKNOWN";
          const row = { dex: d.dex, symbB, symbQ, ...p, blockNumber };
          out.push(row);
          await store(row);
        } catch (err) {
          continue;
        }
      }
    }

    if (out.length === 0) {
      console.log('Aucun marché disponible sur ces DEX/fees pour les paires choisies.');
      return;
    }

    console.log(
      out
        .filter(x => Number.isFinite(x.price))
        .map(x => `${x.dex}:${x.price.toFixed(6)} ${label(x.symbQ)}/${label(x.symbB)} @#${x.blockNumber}`)
        .join(' | ')
    );
  } catch (e) {
    console.error('tick:', e.message);
  }
}


/* // (Optionnel) calcul d'écart :
const GAP_ALERT = 0.005; // 0.5%
const a = out[0], b = out[1];
const pct = b.priceETH_USDC / a.priceETH_USDC - 1;
if (Math.abs(pct) >= GAP_ALERT) {
  const s = pct >= 0 ? '+' : '';
  console.log(`ECART ${s}${(pct*100).toFixed(2)}% — ${b.dex} vs ${a.dex}`);
}
*/

async function main() {
  let lastBlock = 0;

  const current = await provider.getBlockNumber();
  console.log('Démarré. Bloc actuel :', current);
  await tick();

  provider.on('block', async (blockNumber) => {
    if (blockNumber !== lastBlock) {
      lastBlock = blockNumber;
      console.log('Nouveau bloc :', blockNumber);
      await tick();
    }
  });

  provider.on('error', (err) => console.error('provider error:', err?.message || err));
}

process.on('SIGINT', async () => { await pool.end().catch(()=>{}); process.exit(0); });
main().catch(e => { console.error(e); process.exit(1); });
