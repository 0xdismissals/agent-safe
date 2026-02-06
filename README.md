# Agent Safe

A powerful, multi-chain Safe wallet skill for **ClawdBot** that enables autonomous agent activities with user-centric security. The skill supports 13+ EVM chains, dynamic DeFi interactions via Uniswap and Aave, and manages a registry of distributed Safe wallets.

## Features

- **Multi-Chain Ubiquity**: Native support for 13+ chains (Base, Ethereum, Optimism, Arbitrum, Polygon, BSC, Avalanche, Gnosis, Unichain, etc.).
- **Multi-Safe Registry**: Track and switch between multiple Safes across different networks using a persistent `safes.json` registry.
- **Customizable Signers**: Deploy N/M Safes (e.g., 2/3) with multiple owners directly from the wizard.
- **DeFi Integration**:
  - **Uniswap V3**: Swap any whitelisted token pair.
  - **Aave V3**: Deposit/Withdraw any market token with dynamic on-chain decimal resolution.
- **Co-Signing Flow**: Agent proposes transactions, user reviews and confirms via the official Safe UI.

## Quick Start

```bash
# Install dependencies
npm install

# Run the skill (Follow the Wizard for setup)
npm start
```

## Documentation

- **[SKILL.md](./SKILL.md)**: Full command reference and installation guide.
- **[DEVGUIDE.md](./DEVGUIDE.md)**: Deep dive into the architecture and development instructions.

## Setup Wizard

The wizard orients the agent and user to the Safe ecosystem:

1. **Agent Setup**: Generates a local EOA for the agent.
2. **Owner Configuration**: Add one or more human owner addresses to the Safe.
3. **Chain Selection**: Configure the target chain via `CHAIN_ID` environment variable.
4. **Deployment**: Deploys the Safe contract with the specified threshold.

## Commands

See [SKILL.md](./SKILL.md) for a full list of commands including:
- `safe.list_safes()`: View all your deployed Safes.
- `safe.select_safe(address)`: Switch the active Safe and Chain.
- `safe.swap(from, to, amount)`: Execute Uniswap V3 swaps.
- `safe.aave_deposit(token, amount)`: Supply assets to Aave markets.

## Architecture

```
src/
├── index.ts                 # Main skill entry & CLI
├── config.ts                # Multi-chain registry & defaults
├── services/
│   ├── KeyManager.ts        # Encrypted storage
│   ├── BalanceService.ts    # Multi-chain balance queries
│   ├── UniswapService.ts    # V3 Swap logic
│   ├── AaveService.ts       # V3 Lending logic
│   └── SafeService.ts       # Protocol Kit wrapper
├── state/
│   ├── StateManager.ts      # Persistent State & Safe Registry
│   └── types.ts             # Registry & Skill types
└── operations/
    └── SafeOperations.ts    # Transaction proposal orchestrator
```

## Security & Ethics

- The agent **never** has solo control of the funds; all transactions require a human signature.
- No private keys are ever transmitted over the network or logged.
