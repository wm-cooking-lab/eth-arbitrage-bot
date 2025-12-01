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

## Architecture du projet
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
## Installation

### 1. Cloner le repository
```bash
git clone https://github.com/<wm-cooking-lab>/eth-arbitrage-bot
cd eth-arbitrage-bot
```

### 2. Installer les dépendances
```bash
npm install
```

## Configuration
Créer un fichier .env à la racine du projet : 
```bash
RPC_URL=
PRIVATE_KEY=
DATABASE_URL=
```
Un fichier .env.example est fourni pour indiquer les variables attendues.

## Lancement du bot
Avant de lancer le bot pour la première fois, vous devez approuver l’accès de vos tokens aux routeurs Uniswap / SushiSwap : 
```bash
node src/approve.js
```
Démarrer le bot :
```bash
node src/index.js
```
Exemple d’opportunité détectée :
```bash
{
  "Buy": "uniswap-v2",
  "Sell": "uniswap-v3-3000",
  "Pair": "USDC/SHIB",
  "SpreadPct": 0.004149145936847805
}
```
## Limites actuelles & pistes d’amélioration

Ce projet est volontairement focalisé sur la logique de base de l’arbitrage (détection de spread, resimulation, exécution).  
Plusieurs aspects importants du MEV en production ne sont **pas encore** implémentés :

###  Utilisation d’un validateur / relay privé

Actuellement, le bot envoie ses transactions via un RPC public :

- les transactions sont visibles dans le **mempool public** ;
- d’autres bots peuvent **front-run** ou **back-run** ces arbitrages ;
- la stratégie peut se faire “voler” entre la détection et l’inclusion dans le bloc.

Piste d’amélioration :

- passer par un **relay / builder privé** ;
- packager les transactions d’arbitrage dans un **bundle** protégé ;
- éviter d’exposer les opportunités directement au mempool public.


###  Prise en compte incomplète des frais de la blockchain

Dans cette version, le bot se concentre sur :

- le **spread entre prix d’achat et de vente** ;
- la **quantité de tokens** entrée/sortie.

Il ne calcule pas encore précisément :

- le **coût total en gas** des deux swaps (buy + sell) ;
- le coût d’éventuels transfers / approvals ;
- l’impact de la congestion réseau sur les frais.

On part implicitement du principe que :

> **`amountIn` est suffisamment grand pour que le spread couvre largement les gas fees.**

Pistes d’amélioration :

- estimer le coût gas des transactions via `estimateGas` pour chaque étape ;
- intégrer les gas fees dans la décision finale :  
  `profit_net = montant_sortie - montant_entree - coûts_gas` ;
- ignorer toute opportunité dont le profit net estimé est inférieur à un seuil donné.


###  Autres améliorations possibles

Quelques axes naturels d’extension :

- ajouter d’autres DEX (Curve, Balancer, Maverick, etc.) ;
- gérer les **routes multi-hop** (ex : USDC → WETH → TOKEN) plutôt que des paires simples ;
- améliorer la gestion du slippage avec un modèle plus fin ;
- brancher un système de **monitoring / dashboard** sur PostgreSQL ;


En résumé : ce bot vise à fournir une **base propre et pédagogique** pour l’arbitrage on-chain.  
La logique MEV “industrielle” peut être construite par-dessus cette architecture.

## Avertissement

Ce projet est un outil d'étude avancé dédié à la compréhension du MEV.
L’auteur décline toute responsabilité quant aux pertes financières éventuelles.
