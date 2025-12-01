import "dotenv/config";
import { ethers } from "ethers";

export const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
export const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

export const TOKENS = {
  SHIB: { address: '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce', decimals: 18 },
  USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
  WBTC: { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8 },
  WETH: { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
};

export const DEXES = [
  { dex: 'uniswap-v2',      proto: 'v2', factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f' },
  { dex: 'sushiswap-v2',    proto: 'v2', factory: '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac' },
  { dex: 'uniswap-v3-500',  proto: 'v3', factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984', fee: 500 },
  { dex: 'uniswap-v3-3000', proto: 'v3', factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984', fee: 3000 },
];

export const ROUTERS_V2 = {
  "uniswap-v2":   "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  "sushiswap-v2": "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
};

export const SWAP_ROUTER_V3 = "0xE592427A0AEce92De3Edee1F18E0157C05861564";