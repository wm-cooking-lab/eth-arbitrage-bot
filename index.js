import 'dotenv/config';
import { ethers } from 'ethers';
import { store, storeOpp, pool } from "./db.js";
import { fetchSpotPriceV2, fetchSpotPriceV3, provider } from "./fetchPrices.js";
import { diffPrice, GAP_ALERT } from "./diffPrice.js";

const DEXES = [
  { dex: 'uniswap-v2',   proto: 'v2', factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f' }, // Uni V2
  { dex: 'sushiswap-v2', proto: 'v2', factory: '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac' }, // Sushi V2
  { dex: 'uniswap-v3-500',  proto: 'v3', factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984', fee: 500 },
  { dex: 'uniswap-v3-3000', proto: 'v3', factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984', fee: 3000 },
];


const TOKENS = {
  SHIB: { address: '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce', decimals: 18 },
  USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
  WBTC: { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8 },
  WETH: { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
};


const PAIRS = [
  [TOKENS.USDC.address, TOKENS.WETH.address],
  [ TOKENS.USDC.address, TOKENS.WBTC.address],
  [ TOKENS.USDC.address, TOKENS.SHIB.address],
];

async function tick() {
  try {
    const out = [];
    const blockNumber = await provider.getBlockNumber(); 
    for (const [base, quote] of PAIRS) {
      const start = out.length;  
      for (const d of DEXES) {
        try {
          const b = ethers.getAddress(base);
          const q = ethers.getAddress(quote);

          let symbB = "UNKNOWN", decBase = 18;
          let symbQ = "UNKNOWN", decQuote = 18;

          for (const [sym, t] of Object.entries(TOKENS)) {
            const a = ethers.getAddress(t.address);
            if (a === b) { symbB = sym; decBase = Number(t.decimals); }
            if (a === q) { symbQ = sym; decQuote = Number(t.decimals); }
            if (symbB !== "UNKNOWN" && symbQ !== "UNKNOWN") break;
          }

          const p = d.proto === 'v3'? await fetchSpotPriceV3(d.factory, b, q,decBase, decQuote, d.fee) : 
          await fetchSpotPriceV2(d.factory, b, q, decBase, decQuote);

          if (p===null){continue}
          const row = { dex: d.dex, symbB, symbQ, p, blockNumber };
          out.push(row);
          await store(row);
        } catch (err) {
          continue;
        }
      }
    
      var opp = [];
      for (let i = start; i < out.length - 1; i++) {
        for (let j = i + 1; j < out.length; j++) {
          let diff = diffPrice(out[i], out[j]);
          if (diff !== null){
            opp.push(diff);
            await storeOpp(diff, blockNumber);
          }
         
        }
      }
  }
  
    if (out.length === 0) {
      console.log('Aucun marché disponible sur ces DEX/fees pour les paires choisies.');
    }
  console.log(`[tick @#${blockNumber}] lignes valides:`,out.filter(x => typeof x.p=== 'number' && isFinite(x.p)).length);
  console.log("Opportunities:", opp);
 } 
catch (e) {
    console.error('tick:', e.message);
  }

}

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