import 'dotenv/config';
import { ethers } from 'ethers';
import pkg from 'pg';
const { Pool } = pkg;

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

const USDC = ethers.getAddress("0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
const SHIB = ethers.getAddress("0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE");
const FACTORY = ethers.getAddress("0x1F98431c8aD98523631AE4a59f267346ea31F984"); // UniswapV3Factory

const factory = new ethers.Contract(FACTORY, [
  "function getPool(address,address,uint24) view returns (address)"
], provider);

const pool500 = await factory.getPool(USDC, SHIB, 500);   // 0.05%
console.log("pool500:", pool500); // 0x0000... si absent
