// approuve.js
import "dotenv/config";
import { ethers } from "ethers";
import { provider, signer, TOKENS, ROUTERS_V2, SWAP_ROUTER_V3 } from "./config.js";

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)"
];

const MAX_UINT = ethers.MaxUint256;

async function main() {
  const from = await signer.getAddress();
  console.log("Bot address:", from);

  const routerAddresses = [
    ...Object.values(ROUTERS_V2),
    SWAP_ROUTER_V3,
  ];

  for (const [sym, info] of Object.entries(TOKENS)) {
    const tokenAddr = info.address;
    const token = new ethers.Contract(tokenAddr, ERC20_ABI, signer);

    for (const router of routerAddresses) {
      console.log(`Approving ${sym} (${tokenAddr}) for router: ${router}`);

      const tx = await token.approve(router, MAX_UINT);
      console.log("  tx hash:", tx.hash);
      await tx.wait();
    }
  }

  console.log("All approvals done.");
}

main().catch(console.error);
