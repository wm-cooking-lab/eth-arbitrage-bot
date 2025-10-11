import { ethers } from 'ethers';
//import {provider } from "./fetchPrices.js";

const ROUTERS = {
  'uniswap-v2': '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
  'sushiswap-v2': '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',
};
const Router_ABI =[
'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)'
]

const QUOTER = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6";
const QUOTER_ABI = [
  "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) view returns (uint256 amountOut)"
];

export function recheckOpp(opp, amountIn){
    

    for (let i=0; i<opp.length; i++) {
        const [base, quote] = opp[i].Pair.split("/");
        const addr_base = ethers.getAddress(TOKENS[base].address);
        const addr_quote = ethers.getAddress(TOKENS[quote].address);
        let qtt_buy;
        let qtt_sell;
        let real_spread;
        if (opp[i].Buy.includes('v2')) {
            const router = new ethers.Contract(ROUTERS[opp[i].Buy],Router_ABI,provider); //checksum ?? 
            const amounts = await router.getAmountsOut(amountIn, [addr_base, addr_quote]);
            qtt_buy = amounts[amounts.length - 1];
        }
        if (opp[i].Buy.includes('v3')) {
            const quoter = new ethers.Contract(Quoter, Quoter_ABI, provider); //checksum ?? 
            const fee = Number(opp[i].Buy.split('-').at(-1));
            qtt_buy = await quoter.quoteExactInputSingle(addr_base, addr_quote, fee, amountIn, 0);
        }
        if (opp[i].Sell.includes('v2')) {
            const router2 = new ethers.Contract(ROUTERS[opp[i].Sell],Router_ABI,provider); //checksum ?? 
            const amounts2 = await router2.getAmountsOut(amountIn, [addr_quote, addr_base]);
            qtt_sell = amounts2[amounts.length - 1];
        }
        if (opp[i].Sell.includes('v3')) {
            const quoter2 = new ethers.Contract(Quoter, Quoter_ABI, provider); //checksum ?? 
            const fee2 = Number(opp[i].Sell.split('-').at(-1));
            qtt_sell = await quoter2.quoteExactInputSingle(addr_quote, addr_base, fee2, amountIn, 0);
        }
        real_spread = (qtt_sell-qtt_buy)/qtt_buy;
        if (real_spread>= GAP_ALERT) {
            swapExactTokensForTokens(amountIn, amountOutMin,[addr_base, addr_quote],address to, uint deadline);

        }
    }
}