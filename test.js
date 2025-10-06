import 'dotenv/config';
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

// Adresses normalisées (checksum EIP-55)
const USDC    = ethers.getAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
const SHIB    = ethers.getAddress('0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE');
const FACTORY = ethers.getAddress('0x1F98431c8aD98523631AE4a59f267346ea31F984'); // Uniswap V3 Factory

const V3_FACTORY_ABI = [
  'function getPool(address,address,uint24) view returns (address)'
];

const V3_POOL_ABI = [
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function fee() view returns (uint24)',
  'function liquidity() view returns (uint128)',
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)'
];

async function main() {
  const factory = new ethers.Contract(FACTORY, V3_FACTORY_ABI, provider);

  // Peu importe l’ordre des tokens: la factory trie en interne (token0 < token1)
  const pool500 = await factory.getPool(USDC, SHIB, 500);
  console.log('getPool(USDC, SHIB, 500) =', pool500);

  if (!pool500 || pool500 === ethers.ZeroAddress) {
    console.log('=> Aucun pool Uniswap v3 0.05% (500) pour USDC/SHIB.');
    return;
  }

  const pool = new ethers.Contract(pool500, V3_POOL_ABI, provider);
  const [token0, token1, fee, L, slot] = await Promise.all([
    pool.token0(),
    pool.token1(),
    pool.fee(),
    pool.liquidity(),
    pool.slot0(),
  ]);

  console.log('token0:', token0);
  console.log('token1:', token1);
  console.log('fee:', Number(fee));
  console.log('liquidity:', L.toString());
  console.log('sqrtPriceX96:', slot.sqrtPriceX96.toString());

  if (L === 0n) {
    console.log('=> Pool trouvé mais **sans liquidité active** (liquidity = 0).');
  } else {
    console.log('=> Pool **actif** (liquidity > 0).');
  }
}

main().catch(err => console.error(err));
