# ETH Arbitrage Bot — Uniswap V2 / V3 & SushiSwap  
### *High-Frequency On-Chain Arbitrage Engine (Node.js + Ethers v6 + PostgreSQL)*

Ce projet est un **bot MEV** complet, conçu pour détecter et exécuter des arbitrages entre plusieurs DEX Ethereum en temps réel.  
Il combine :

- lecture on-chain ultrarapide (Uniswap V2, SushiSwap, Uniswap V3)  
- détection automatique de spreads  
- resimulation avant exécution  
- exécution automatisée sur les routeurs V2/V3  
- stockage PostgreSQL pour analyse historique  
- architecture claire, modulaire et extensible  


## Fonctionnalités principales

### Scan en temps réel des DEX
À chaque nouveau bloc Ethereum, le bot interroge :

- **Uniswap V2**
- **SushiSwap V2**
- **Uniswap V3** (pools 0.05% et 0.30%)

Lecture du prix via :
- V2 → `getReserves()`
- V3 → `slot0()` + conversion du tick

### Calcul du prix spot
Le bot calcule automatiquement :

- le prix du base asset  
- en gérant les décimales exactes  
- pour les paires : USDC/WETH, USDC/WBTC, USDC/SHIB  


### Détection d’opportunités d’arbitrage
Pour chaque DEX :

```text
spread = (sellPrice - buyPrice) / buyPrice
```
Les opportunités sont :

- détectées automatiquement
- loggées en base PostgreSQL
- affichées en console

### Resimulation avant exécution
Pour éviter :

- slippage
- changements de prix
- bots MEV concurrents
- transactions non rentables

Le bot utilise :

- Uniswap V2 → getAmountsOut()
- Uniswap V3 → quoteExactInputSingle()

Si le spread recalculé ≥ GAP_ALERT → exécution automatique.

### Exécution des swaps
Le bot supporte :

- Uniswap V2 Router
```text
 swapExactTokensForTokens
```
- Uniswap V3 Router
```text
exactInputSingle
```
Avec :

- calcul dynamique de amountOutMin
- tolérance slippage configurable
- exécution via un wallet EVM local

### Base de données PostgreSQL
Le bot enregistre :

- tous les prix lus
- les spreads détectés
- les arbitrages analysés
- les block numbers
  
Idéal pour analyse et optimisation.

### Architecture du projet
```text
eth-arbitrage-bot/
│
├── src/
│   ├── index.js
│   │     ↳ Boucle principale du bot : lecture des prix, détection des spreads,
│   │       stockage des données, appel à recheckAndExecute().
│   │
│   ├── config.js
│   │     ↳ Centralise toute la configuration : provider RPC, wallet (signer),
│   │       adresses des tokens, DEX supportés.
│   │
│   ├── fetchPrices.js
│   │     ↳ Lecture des prix :
│   │          • Uniswap V2 : getReserves()
│   │          • Uniswap V3 : slot0(), tick, sqrtPriceX96 conversion
│   │
│   ├── diffPrice.js
│   │     ↳ Compare les prix entre DEX et calcule les spreads.
│   │
│   ├── gas.js
│   │     ↳ Resimulation du trade (anti-faux positifs) :
│   │          • getAmountsOut() pour V2
│   │          • quoteExactInputSingle() pour V3
│   │       Exécution automatique des arbitrages.
│   │
│   ├── approve.js
│   │     ↳ Script one-shot :
│   │          Approve USDC, WETH, WBTC, SHIB
│   │          sur Uniswap V2, SushiSwap et Uniswap V3.
│   │
│   ├── db.js
│         ↳ Connexion à PostgreSQL.
│           Stockage des :
│             • prix
│             • spreads
│             • arbitrages détectés
│
├── package.json
│     ↳ Dépendances du projet (ethers v6, pg, dotenv, etc.)  
│
├── package-lock.json
│     ↳ Exige la version exacte des dépendances pour reproductibilité.
│
├── .env
│     ↳ Variables sensibles **non commit** :
│          RPC_URL
│          PRIVATE_KEY
│          DATABASE_URL
│
├── .env.example
│     ↳ Modèle pour les autres utilisateurs 

│
├── .gitignore

│
└── README.md
      ↳ Documentation complète du projet.
```
