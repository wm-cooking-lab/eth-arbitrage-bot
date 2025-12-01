import { ethers } from "ethers";

export const ROUTERS_V2 = {
  "uniswap-v2": "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  "sushiswap-v2": "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
};

// ABI V2 : lecture + swap
const ROUTER_V2_ABI = [
  "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts)",
  "function swapExactTokensForTokens(uint256 amountIn,uint256 amountOutMin,address[] calldata path,address to,uint256 deadline) external returns (uint256[] memory amounts)",
];


const QUOTER_V3 = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6";
const QUOTER_V3_ABI = [
  "function quoteExactInputSingle(address tokenIn,address tokenOut,uint24 fee,uint256 amountIn,uint160 sqrtPriceLimitX96) view returns (uint256 amountOut)",
];

export const SWAP_ROUTER_V3 = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
const SWAP_ROUTER_V3_ABI = [
  "function exactInputSingle(tuple(address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
];


const SLIPPAGE_BUY  = 0.003; // 0.3%
const SLIPPAGE_SELL = 0.003; // 0.3%


export async function recheckAndExecute(oppList, amountIn, provider, signer) {
  for (let i = 0; i < oppList.length; i++) {
    const opp = oppList[i];

    const [base, quote] = opp.Pair.split("/");
    const addr_base = ethers.getAddress(TOKENS[base].address);
    const addr_quote = ethers.getAddress(TOKENS[quote].address); 

    let qtt_buy;  
    let qtt_sell; 

    if (opp.Buy.includes("v2")) {
      const routerBuy = new ethers.Contract(ROUTERS_V2[opp.Buy],ROUTER_V2_ABI,provider);
      const amounts = await routerBuy.getAmountsOut(amountIn, [addr_base, addr_quote]);
      qtt_buy = amounts[amounts.length - 1];
    } 
    else if (opp.Buy.includes("v3")) {
      const quoter = new ethers.Contract(QUOTER_V3, QUOTER_V3_ABI, provider);
      const fee = Number(opp.Buy.split("-").at(-1)); // ex: "uniswap-v3-3000"
      qtt_buy = await quoter.quoteExactInputSingle(addr_base,addr_quote,fee,amountIn,0);
    }

    if (!qtt_buy) continue;

  
    if (opp.Sell.includes("v2")) {
      const routerSellView = new ethers.Contract(ROUTERS_V2[opp.Sell],ROUTER_V2_ABI,provider);
      const amounts2 = await routerSellView.getAmountsOut(qtt_buy, [addr_quote, addr_base]);
      qtt_sell = amounts2[amounts2.length - 1];
    } else if (opp.Sell.includes("v3")) {
      const quoter2 = new ethers.Contract(QUOTER_V3, QUOTER_V3_ABI, provider);
      const fee2 = Number(opp.Sell.split("-").at(-1));
      qtt_sell = await quoter2.quoteExactInputSingle(addr_quote,addr_base,fee2,qtt_buy,0);
    }

    if (!qtt_sell) continue;

    const real_spread = (Number(qtt_sell - amountIn) / Number(amountIn)); 

    if (real_spread < GAP_ALERT) continue;

    const from = await signer.getAddress();
    const deadline = Math.floor(Date.now() / 1000) + 60; // 60s
    let minBuyNum = Number(qtt_buy) * (1 - SLIPPAGE_BUY);
    let minBuy = BigInt(Math.floor(minBuyNum));

    // ⚠️ IMPORTANT : approves à faire AVANT (hors de cette fonction)
    // Exemple: USDC.approve(routerAddress, amountIn)

    if (opp.Buy.includes("v2")) {
      const routerBuyExec = new ethers.Contract(ROUTERS_V2[opp.Buy],ROUTER_V2_ABI,signer);
      console.log("  Executing BUY V2 on", opp.Buy);

      const txBuy = await routerBuyExec.swapExactTokensForTokens(amountIn,minBuy,[addr_base, addr_quote],from,deadline);
      console.log("  BUY tx hash:", txBuy.hash);
      await txBuy.wait();
    } 
    else if (opp.Buy.includes("v3")) {
      const fee = Number(opp.Buy.split("-").at(-1));
      const routerV3 = new ethers.Contract(SWAP_ROUTER_V3, SWAP_ROUTER_V3_ABI,signer);

      console.log("  Executing BUY V3 on", opp.Buy);

      const params = {
        tokenIn: addr_base,
        tokenOut: addr_quote,
        fee,
        recipient: from,
        amountIn,
        amountOutMinimum: minBuy,
        sqrtPriceLimitX96: 0n,
      };

      const txBuy = await routerV3.exactInputSingle(params);
      console.log("  BUY V3 tx hash:", txBuy.hash);
      await txBuy.wait();
    }

    // ================== SELL EXECUTION ==================
    // amountOutMin pour le SELL (qty base min)
    let minSellNum = Number(qtt_sell) * (1 - SLIPPAGE_SELL);
    let minSell = BigInt(Math.floor(minSellNum));

    if (opp.Sell.includes("v2")) {
      const routerSellExec = new ethers.Contract(
        ROUTERS_V2[opp.Sell],
        ROUTER_V2_ABI,
        signer
      );

      console.log("  Executing SELL V2 on", opp.Sell);

      const txSell = await routerSellExec.swapExactTokensForTokens(
        qtt_buy,                 
        minSell,                 
        [addr_quote, addr_base],  
        from,
        deadline
      );
      console.log("  SELL V2 tx hash:", txSell.hash);
      await txSell.wait();
    } else if (opp.Sell.includes("v3")) {
      const fee2 = Number(opp.Sell.split("-").at(-1));
      const routerV3 = new ethers.Contract(
        SWAP_ROUTER_V3,
        SWAP_ROUTER_V3_ABI,
        signer
      );

      console.log("  Executing SELL V3 on", opp.Sell);

      const paramsSell = {
        tokenIn: addr_quote,
        tokenOut: addr_base,
        fee: fee2,
        recipient: from,
        amountIn: qtt_buy,
        amountOutMinimum: minSell,
        sqrtPriceLimitX96: 0n,
      };

      const txSell = await routerV3.exactInputSingle(paramsSell);
      console.log("  SELL V3 tx hash:", txSell.hash);
      await txSell.wait();
    }
    console.log("Arbitrage sequence completed for this opp.\n");
  }
}