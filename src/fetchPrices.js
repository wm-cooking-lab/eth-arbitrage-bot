import { ethers } from "ethers";
import { provider } from "./config.js";

const V2_FACTORY_ABI = ['function getPair(address,address) view returns (address)'];
const V3_FACTORY_ABI = ['function getPool(address,address,uint24) view returns (address)'];

const PAIR_ABI = [
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
];

const V3_POOL_ABI = [
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function liquidity() view returns (uint128)'
];

export async function fetchSpotPriceV2(factoryAddress, base, quote,decBase, decQuote) {

// Normalize all input addresses to checksum format
  const f = ethers.getAddress(factoryAddress);

  const factory = new ethers.Contract(f, V2_FACTORY_ABI, provider);
  const pairAddress = await factory.getPair(base, quote);
  if (!pairAddress || pairAddress === ethers.ZeroAddress) {
    return null;
  }

  const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
  const reserves = await (pair.getReserves());

  if (reserves.reserve0 === 0n || reserves.reserve1 === 0n) return null;

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
  let price =  ResBase/ResQuote;
  return price;
}


export async function fetchSpotPriceV3(factoryAddress, base, quote, decBase, decQuote, fee) {

  const f = ethers.getAddress(factoryAddress);

  const factory = new ethers.Contract(f, V3_FACTORY_ABI, provider);
  const poolAddress = await factory.getPool(base, quote, fee);
  if (!poolAddress || poolAddress === ethers.ZeroAddress) {
    return null;
  }

  const poolV3 = new ethers.Contract(poolAddress, V3_POOL_ABI, provider);
  const [slot, liquidity] = await Promise.all([ poolV3.slot0(), poolV3.liquidity() ]);

  if (liquidity === 0n) return null;

  const sqrtX96 = slot.sqrtPriceX96; //BigInt
  const Q192 = (1n << 192n); // 2^192

  let num = sqrtX96 * sqrtX96; 
  let den = Q192;
  let price;

  // token1/token0=(sqrt^2 / 2^192)
  if (BigInt(base)>BigInt(quote)) { // Base = token 1
    price = Number(num)/Number(den)*10**(decQuote-decBase) ;
  } else {  //Base = token 0 
    price = Number(den)/Number(num)*10**(decQuote-decBase);
  }
  return price;
}