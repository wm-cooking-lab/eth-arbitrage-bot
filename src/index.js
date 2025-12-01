import "dotenv/config";
import { ethers } from "ethers";
import { store, storeOpp, pool } from "./db.js";
import { provider, signer, TOKENS, DEXES } from "./config.js";
import { fetchSpotPriceV2, fetchSpotPriceV3 } from "./fetchPrices.js";
import { diffPrice } from "./diffPrice.js";
import { recheckAndExecute } from "./gas.js";

const PAIRS = [
  [TOKENS.USDC.address, TOKENS.WETH.address],
  [TOKENS.USDC.address, TOKENS.WBTC.address],
  [TOKENS.USDC.address, TOKENS.SHIB.address],
];

async function tick() {
  try {
    const out = [];
    const opp = []; // toutes les opportunités de ce tick
    const blockNumber = await provider.getBlockNumber();

    for (const [base, quote] of PAIRS) {
      const start = out.length; // index de début pour cette paire

      for (const d of DEXES) {
        try {
          const b = ethers.getAddress(base);
          const q = ethers.getAddress(quote);

          let symbB = "UNKNOWN",
            decBase = 18;
          let symbQ = "UNKNOWN",
            decQuote = 18;

          for (const [sym, t] of Object.entries(TOKENS)) {
            const a = ethers.getAddress(t.address);
            if (a === b) {
              symbB = sym;
              decBase = Number(t.decimals);
            }
            if (a === q) {
              symbQ = sym;
              decQuote = Number(t.decimals);
            }
            if (symbB !== "UNKNOWN" && symbQ !== "UNKNOWN") break;
          }

          const p =
            d.proto === "v3"
              ? await fetchSpotPriceV3(d.factory, b, q, decBase, decQuote, d.fee)
              : await fetchSpotPriceV2(d.factory, b, q, decBase, decQuote);

          if (p === null) continue;

          const row = { dex: d.dex, symbB, symbQ, p, blockNumber };
          out.push(row);
          await store(row);
        } catch (err) {
          console.error(
            `Erreur sur pair ${base}/${quote}, DEX ${d.dex}:`,
            err?.message || err
          );
          continue;
        }
      }

      // détection d'opportunités pour cette paire
      for (let i = start; i < out.length - 1; i++) {
        for (let j = i + 1; j < out.length; j++) {
          const diff = diffPrice(out[i], out[j]);
          if (diff !== null) {
            opp.push(diff);
            await storeOpp(diff, blockNumber);
          }
        }
      }
    }

    if (out.length === 0) {
      console.log(
        "Aucun marché disponible sur ces DEX/fees pour les paires choisies."
      );
    }

    console.log(
      `[tick @#${blockNumber}] lignes valides:`,
      out.filter((x) => typeof x.p === "number" && isFinite(x.p)).length
    );
    console.log("Opportunities:", opp);

    // exécution arbitrage (si au moins une opp)
    if (opp.length > 0) {
      const amountIn = ethers.parseUnits("50", 6); // 50 USDC
      await recheckAndExecute(opp, amountIn, provider, signer);
    }
  } catch (e) {
    console.error("tick:", e.message);
  }
}

async function main() {
  let lastBlock = 0;

  const current = await provider.getBlockNumber();
  console.log("Démarré. Bloc actuel :", current);
  await tick();

  provider.on("block", async (blockNumber) => {
    if (blockNumber !== lastBlock) {
      lastBlock = blockNumber;
      console.log("Nouveau bloc :", blockNumber);
      await tick();
    }
  });

  provider.on("error", (err) =>
    console.error("provider error:", err?.message || err)
  );
}

process.on("SIGINT", async () => {
  await pool.end().catch(() => {});
  process.exit(0);
});

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
