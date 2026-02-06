Creates an agent EOA, deploys a 2/3 or n/m Safe (Gnosis Safe) on **13+ supported EVM chains**, and enables basic wallet operations, Uniswap V3 swaps, and Aave V3 lending. The user co-signs transactions via Safe UI. Protocols can be easily integrated as modules.

> [!NOTE]
> The agent's EOA private key is stored in the `.agent-safe/wallet.json` file in plain text. Since this is a "hot" wallet and the primary security is handled by the Safe multisig (where the user holds the majority of keys), this is acceptable for POC and dev environments. PLEASE DO NOT RUN PORDUCTION BEFORE UNDERSTANDING RISKS AND THE CODEBASE.

## Prerequisites

- **Node.js 18+** must be installed on the system
- If using nvm, source it first: `source ~/.nvm/nvm.sh`

## Project Location

``` 
[PROJECT_ROOT]  (e.g., /home/user/agent-safe)
```

Run these commands to install dependencies:

```bash
source ~/.nvm/nvm.sh 2>/dev/null || true
cd [PROJECT_ROOT]
npm install
```

### Environment Variables

| `CHAIN_ID` | The EVM Chain ID to use (e.g., 1 for ETH, 8453 for Base) | `84532` (Base Sepolia) |

If `npm` is not found, try:

```bash
/usr/local/bin/npm install
```

Or with nvm:

```bash
source ~/.nvm/nvm.sh && npm install
```

---

## Running Commands

All commands use this pattern - always source nvm first if needed:

```bash
source ~/.nvm/nvm.sh 2>/dev/null || true
cd [PROJECT_ROOT]
npx tsx -e "<TYPESCRIPT_CODE>"
```

> **Important:** In a **fresh process**, always call `wizardStart()` once before any other Safe operations (balances, sends, swaps). This ensures the wallet is loaded and avoids `"No wallet loaded. Call createWallet() or loadWallet() first."` errors.

Minimal bootstrap you can run at the top of a session:

```bash
source ~/.nvm/nvm.sh 2>/dev/null || true && cd [PROJECT_ROOT] && npx tsx -e "
import { SafeWalletSkill } from './src/index.ts';
const skill = new SafeWalletSkill();
const result = await skill.wizardStart();
console.log(JSON.stringify(result, (k,v) => typeof v === 'bigint' ? v.toString() : v, 2));
"
```

If the wizard is already completed, this just reloads state and returns the existing config.

---

## CLI Commands (Experimental)

You can also run common operations directly from the terminal using command-line arguments:

```bash
source ~/.nvm/nvm.sh 2>/dev/null || true && cd [PROJECT_ROOT]
# Default (Base Sepolia)
npx tsx src/index.ts --command balances

# Targeting Ethereum Mainnet
CHAIN_ID=1 npx tsx src/index.ts --command balances

# Faucet on Testnet
npx tsx src/index.ts --command faucet --token USDC --amount 1000
```

These commands handle the initialization automatically.

---

## Wizard Flow

### Step 1: Create Agent Wallet

```bash
source ~/.nvm/nvm.sh 2>/dev/null || true && cd [PROJECT_ROOT] && npx tsx -e "
import { SafeWalletSkill } from './src/index.ts';
const skill = new SafeWalletSkill();
const result = await skill.wizardStart();
console.log(JSON.stringify(result, (k,v) => typeof v === 'bigint' ? v.toString() : v, 2));
"
```

**Output:** Returns `agentAddress` - tell user to send gas funds (~0.001 ETH) to this address on the chosen chain.

### Step 2: Check Agent Funds

```bash
source ~/.nvm/nvm.sh 2>/dev/null || true && cd [PROJECT_ROOT] && npx tsx -e "
import { SafeWalletSkill } from './src/index.ts';
const skill = new SafeWalletSkill();
const result = await skill.wizardCheckAgentFunds();
console.log(JSON.stringify(result, (k,v) => typeof v === 'bigint' ? v.toString() : v, 2));
"
```

**Output:** Returns `ok: true` when agent has enough ETH (~0.0005 minimum).

### Step 3: Add Owner Address(es)

You can add one or more owner addresses. The agent is always owner #1.

```bash
source ~/.nvm/nvm.sh 2>/dev/null || true && cd [PROJECT_ROOT] && npx tsx src/index.ts --command add_owner --address 'USER_WALLET_ADDRESS'
```

Repeat for as many signers as you want.

### Step 4: Deploy Safe

You can specify an optional threshold. Default is 100% of owners (e.g., 3 signers = 3/3 Safe).

```bash
source ~/.nvm/nvm.sh 2>/dev/null || true && cd [PROJECT_ROOT] && npx tsx src/index.ts --command deploy_safe --threshold 2
```

**Output:** Returns `safeAddress` and `deployTxHash`.

---

## Safe Operations

> **Reminder:** In a fresh shell, call `wizardStart()` once before these, as shown above.

### Get Balances

```bash
source ~/.nvm/nvm.sh 2>/dev/null || true && cd [PROJECT_ROOT] && npx tsx -e "
import { SafeWalletSkill } from './src/index.ts';
const skill = new SafeWalletSkill();
await skill.wizardStart();
const result = await skill.safeGetBalances();
console.log(result.summary);
"
```

### Propose ETH Send

Replace `RECIPIENT_ADDRESS` and `ETH_AMOUNT` (e.g., "0.01"):

```bash
source ~/.nvm/nvm.sh 2>/dev/null || true && cd [PROJECT_ROOT] && npx tsx -e "
import { SafeWalletSkill } from './src/index.ts';
const skill = new SafeWalletSkill();
await skill.wizardStart();
const result = await skill.safeProposeSendETH('RECIPIENT_ADDRESS', 'ETH_AMOUNT');
console.log(JSON.stringify(result, null, 2));
"
```

### Propose ERC20 Send

Token can be: USDC, WETH (or a token address from the allowlist):

```bash
source ~/.nvm/nvm.sh 2>/dev/null || true && cd [PROJECT_ROOT] && npx tsx -e "
import { SafeWalletSkill } from './src/index.ts';
const skill = new SafeWalletSkill();
await skill.wizardStart();
const result = await skill.safeProposeSendERC20('TOKEN_SYMBOL', 'RECIPIENT_ADDRESS', 'AMOUNT');
console.log(JSON.stringify(result, null, 2));
"
```

### Check Proposal Status

Replace `SAFE_TX_HASH` with the hash from the propose command:

```bash
source ~/.nvm/nvm.sh 2>/dev/null || true && cd [PROJECT_ROOT] && npx tsx -e "
import { SafeWalletSkill } from './src/index.ts';
const skill = new SafeWalletSkill();
await skill.wizardStart();
const result = await skill.safeCheckProposalStatus('SAFE_TX_HASH');
console.log(result.message);
"
```

### Execute Transaction

After user confirms in Safe UI:

```bash
source ~/.nvm/nvm.sh 2>/dev/null || true && cd [PROJECT_ROOT] && npx tsx -e "
import { SafeWalletSkill } from './src/index.ts';
const skill = new SafeWalletSkill();
await skill.wizardStart();
const result = await skill.safeExecuteIfReady('SAFE_TX_HASH');
console.log(result.message);
"
```

### Agent Sign Transaction

Use this when **the user proposes a transaction first** (e.g. via Safe UI) and the agent needs to add their signature:

```bash
source ~/.nvm/nvm.sh 2>/dev/null || true && cd [PROJECT_ROOT] && npx tsx -e "
import { SafeWalletSkill } from './src/index.ts';
const skill = new SafeWalletSkill();
await skill.wizardStart();
const result = await skill.safeAgentSign('SAFE_TX_HASH');
console.log(result.message);
"
```

This is useful for:
- User-initiated transactions that need agent co-signing
- Adding the agent's signature to any pending Safe transaction

---

## Multi-Safe Management

The agent keeps a registry of all Safes it has deployed across different chains in `safes.json`.

### List All Safes

```bash
source ~/.nvm/nvm.sh 2>/dev/null || true && cd [PROJECT_ROOT] && npx tsx src/index.ts --command list_safes
```

### Select Active Safe

Switch the agent's target to a specific Safe. This will also switch the active chain if the Safe is on a different network.

```bash
source ~/.nvm/nvm.sh 2>/dev/null || true && cd [PROJECT_ROOT] && npx tsx src/index.ts --command select_safe --address 'SAFE_ADDRESS'
```

## Swap Operations (Uniswap V3)

Swaps are done via Uniswap V3 (if supported on the chosen chain) using the Safe as the sender. Flow is the same as sends: **quote → propose swap → user signs in Safe UI → execute**.

### 1. Get Swap Quote (Preview Only)

Preview a swap without executing. Returns expected output amount and route info.

Example: quote **0.01 ETH → USDC**:

```bash
source ~/.nvm/nvm.sh 2>/dev/null || true && cd [PROJECT_ROOT] && npx tsx -e "
import { SafeWalletSkill } from './src/index.ts';
const skill = new SafeWalletSkill();
await skill.wizardStart();
const quote = await skill.safeGetSwapQuote('ETH', 'USDC', '0.01');
console.log(JSON.stringify(quote, (k,v) => typeof v === 'bigint' ? v.toString() : v, 2));
"
```

You can change `'ETH', 'USDC', '0.01'` to any supported token pair + amount.

### 2. Propose Swap (Create Safe Transaction)

Example: **propose 0.01 ETH → USDC swap**:

```bash
source ~/.nvm/nvm.sh 2>/dev/null || true && cd [PROJECT_ROOT] && npx tsx -e "
import { SafeWalletSkill } from './src/index.ts';
const skill = new SafeWalletSkill();
await skill.wizardStart();
const result = await skill.safeProposeSwap('ETH', 'USDC', '0.01');
console.log(JSON.stringify(result, (k,v) => typeof v === 'bigint' ? v.toString() : v, 2));
"
```

Take note of the returned `safeTxHash` – you will use this to check status and execute.

You can also flip the direction, e.g. **USDC → ETH**:

```bash
source ~/.nvm/nvm.sh 2>/dev/null || true && cd [PROJECT_ROOT] && npx tsx -e "
import { SafeWalletSkill } from './src/index.ts';
const skill = new SafeWalletSkill();
await skill.wizardStart();
const result = await skill.safeProposeSwap('USDC', 'ETH', '1');
console.log(JSON.stringify(result, (k,v) => typeof v === 'bigint' ? v.toString() : v, 2));
"
```

### 3. User Confirms in Safe UI

After proposing a swap:

1. User opens [app.safe.global](https://app.safe.global)
2. Selects **Base Sepolia** (testnet) and imports the Safe by address if needed
3. Goes to the **Queue** tab
4. Finds the pending swap transaction and confirms/signs it (2/2 signature: user + agent)

### 4. Execute Swap On-Chain

After 2/2 confirmations, execute via CLI:

```bash
source ~/.nvm/nvm.sh 2>/dev/null || true && cd [PROJECT_ROOT] && npx tsx -e "
import { SafeWalletSkill } from './src/index.ts';
const skill = new SafeWalletSkill();
await skill.wizardStart();
const result = await skill.safeExecuteIfReady('SAFE_TX_HASH');
console.log(result.message);
"
```

Replace `SAFE_TX_HASH` with the `safeTxHash` returned from `safeProposeSwap`.

- Any token pair with an existing Uniswap V3 pool on the active chain (and included in the token config or passed as an address)

If there is **no pool**, `safeGetSwapQuote` or `safeProposeSwap` will fail – that means the pair is not tradable on current Sepolia Uniswap deployment.

---

## ETH ↔ WETH Wrap/Unwrap

Since swaps to "ETH" actually output WETH, use these to convert between them:

### Wrap ETH → WETH

```bash
source ~/.nvm/nvm.sh 2>/dev/null || true && cd [PROJECT_ROOT] && npx tsx -e "
import { SafeWalletSkill } from './src/index.ts';
const skill = new SafeWalletSkill();
await skill.wizardStart();
const result = await skill.safeWrapETH('0.01');
console.log(JSON.stringify(result, null, 2));
"
```

### Unwrap WETH → ETH

```bash
source ~/.nvm/nvm.sh 2>/dev/null || true && cd [PROJECT_ROOT] && npx tsx -e "
import { SafeWalletSkill } from './src/index.ts';
const skill = new SafeWalletSkill();
await skill.wizardStart();
const result = await skill.safeUnwrapWETH('0.01');
console.log(JSON.stringify(result, null, 2));
"
```

---

## Aave V3 Lending

Deposit tokens into Aave V3 (if supported on the chosen chain) to earn yield and withdraw (including interest) at any time.

- **Lending Pool Address:** `0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27`

### Deposit to Aave

Deposit tokens from the Safe into Aave:

```bash
source ~/.nvm/nvm.sh 2>/dev/null || true && cd [PROJECT_ROOT] && npx tsx -e "
import { SafeWalletSkill } from './src/index.ts';
const skill = new SafeWalletSkill();
await skill.wizardStart();
const result = await skill.safeAaveDeposit('USDC', '10');
console.log(JSON.stringify(result, null, 2));
"
```

Change `'USDC', '10'` to any supported token + amount. The Safe will approve the token and deposit into the Aave pool.

### Withdraw from Aave

Withdraw principal + accrued interest:

```bash
source ~/.nvm/nvm.sh 2>/dev/null || true && cd [PROJECT_ROOT] && npx tsx -e "
import { SafeWalletSkill } from './src/index.ts';
const skill = new SafeWalletSkill();
await skill.wizardStart();
const result = await skill.safeAaveWithdraw('USDC', '10');
console.log(JSON.stringify(result, null, 2));
"
```

```ts
await skill.safeAaveWithdraw('USDC', 'max');
```

### Aave Faucet (Testnet Tokens)

Request testnet tokens (WETH, USDC) directly for the Safe. This is an EOA transaction by the agent.

```bash
source ~/.nvm/nvm.sh 2>/dev/null || true && cd [PROJECT_ROOT] && npx tsx -e "
import { SafeWalletSkill } from './src/index.ts';
const skill:any = new SafeWalletSkill();
await skill.init();
const result = await skill.safeAaveFaucet('USDC', '1000');
console.log(JSON.stringify(result, null, 2));
"
```

Or via CLI:

```bash
npx tsx src/index.ts --command faucet --token USDC --amount 1000
```

---

## Supported Chains

The skill supports the following chains with pre-configured tokens and services:

| Chain Name | Chain ID | Services |
|------------|----------|----------|
| Ethereum | 1 | Uniswap |
| Base | 8453 | Uniswap |
| Base Sepolia | 84532 | Uniswap, Aave |
| Optimism | 10 | Uniswap |
| Arbitrum One | 42161 | Uniswap |
| Polygon | 137 | Uniswap |
| BNB Chain | 56 | Basic Ops |
| Gnosis Chain | 100 | Basic Ops |
| Avalanche | 43114 | Basic Ops |
| Monad (Test) | 10143 | Basic Ops |
| Abstract | 2741 | Basic Ops |
| Unichain | 130 | Basic Ops |
| HyperEVM | 999 | Basic Ops |

### Dynamic Token Whitelisting

The agent can dynamically add tokens to the allowlist for the current chain. These are saved to `state.json`.

```bash
source ~/.nvm/nvm.sh 2>/dev/null || true && cd [PROJECT_ROOT] && npx tsx src/index.ts --command add_token --symbol 'TEST' --address '0x...' --decimals 18
```

After adding, the token will appear in `get_balances()` and be available for swaps/sends.

---

## User Signing Flow (Recap)

After proposing a transaction (send, swap, or Aave deposit/withdraw):

1. User opens [app.safe.global](https://app.safe.global)
2. User selects the active network and imports Safe by address
3. User finds pending transaction in **Queue** tab
4. User confirms/signs (2/2 when agent auto-confirms)
5. Agent runs `safeExecuteIfReady()` to execute on-chain

---

## Troubleshooting

**"npm: command not found"**
- Try: `source ~/.nvm/nvm.sh && npm install`
- Or use full path: `/usr/local/bin/npm`

**"Cannot find module"**
- Run `npm install` first in the project directory
- Make sure you are importing from `./src/index.ts` when using `tsx`

**Project directory not found**
- Ensure you have downloaded the skill and are in the correct directory

**"No Uniswap pool exists"**
- The token pair may not have a pool on Base Sepolia
- Try a different token pair (e.g. ETH/USDC) or create a pool first

**"No wallet loaded. Call createWallet() or loadWallet() first."**
- You likely skipped `wizardStart()` in this process
- Fix by calling `wizardStart()` once before any other Safe operation, as shown above.
