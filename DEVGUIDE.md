# Developer Guide: Extending the Safe Wallet Skill

This guide explains how to add support for new protocols (DEXs, Lending Pools, etc.) and chains to the Safe Wallet Skill.

## Architecture Overview

The skill is built to be **chain-agnostic** and **modular**.

1.  **`src/config.ts`**: The central registry of all supported chains and their specific service configurations.
2.  **`src/services/`**: Contains modular classes that interact with specific protocols (e.g., `UniswapService`, `AaveService`).
3.  **`src/operations/SafeOperations.ts`**: The coordinator that handles the logic of preparing multisig transactions using the services.
4.  **`src/index.ts`**: The entry point that exposes commands to the user/AI agent.

---

## Adding a New Protocol

Follow these steps to integrate a new protocol.

### 1. Define the Configuration Type

In `src/types.ts`, add an interface for your protocol's required addresses or parameters.

```typescript
export interface MyProtocolConfig {
    factory: Address;
    router: Address;
    // Add other contract addresses here
}

export interface ChainConfig {
    // ... existing
    services: {
        uniswap?: UniswapConfig;
        aave?: AaveConfig;
        myProtocol?: MyProtocolConfig; // Add your service here
    }
}
```

### 2. Create the Service

Create a new file in `src/services/MyProtocolService.ts`. Your service should focus on building **calls** (to, value, data) rather than executing them.

```typescript
import { encodeFunctionData, type Address, type Hex } from 'viem';
import { MY_PROTOCOL_ABI } from '../abis.js';

export class MyProtocolService {
    constructor(private config: MyProtocolConfig) {}

    async buildDepositCall(amount: bigint): Promise<{ to: Address; data: Hex }> {
        return {
            to: this.config.router,
            data: encodeFunctionData({
                abi: MY_PROTOCOL_ABI,
                functionName: 'deposit',
                args: [amount],
            }),
        };
    }
}
```

### 3. Register in `SUPPORTED_CHAINS`

In `src/config.ts`, add your protocol configuration to the relevant chains.

```typescript
export const SUPPORTED_CHAINS: Record<string, ChainConfig> = {
    '8453': { // Base Mainnet
        name: 'Base',
        chainId: 8453n,
        // ...
        services: {
            uniswap: { ... },
            myProtocol: {
                factory: '0x...',
                router: '0x...',
            }
        }
    }
}
```

### 4. Expose in `SafeOperations.ts`

Initialize your service in the `SafeOperations` constructor and add a method to propose a transaction.

```typescript
export class SafeOperations {
    private myProtocolService?: MyProtocolService;

    constructor(...) {
        if (config.services.myProtocol) {
            this.myProtocolService = new MyProtocolService(config.services.myProtocol);
        }
    }

    async proposeMyProtocolDeposit(amount: string) {
        if (!this.myProtocolService) throw new Error('Not supported on this chain');
        
        const call = await this.myProtocolService.buildDepositCall(parseEther(amount));
        return this.proposeTransaction({
            to: call.to,
            data: call.data,
            description: `Deposit ${amount} into MyProtocol`,
        });
    }
}
```

### 5. Expose in `index.ts`

Add the command to the `SafeWalletSkill` class and the CLI parser.

```typescript
// SafeWalletSkill class
async safeMyProtocolDeposit(amount: string) {
    const ops = await this.ensureOperations();
    return ops.proposeMyProtocolDeposit(amount);
}

// CLI Parser
case 'my_protocol_deposit': {
    const amount = args.amount;
    const result = await skill.safeMyProtocolDeposit(amount);
    console.log(result);
    break;
}
```

---

## Adding a New Chain

To support a new chain, simply add a new entry to the `SUPPORTED_CHAINS` object in `src/config.ts`.

1.  **Chain ID**: Use the standard EVM chain ID (as a string key).
2.  **RPC URL**: Provide an public or environment-variable-backed RPC.
3.  **Safe Transaction Service**: Find the URL for the chain at [Safe Documentation](https://docs.safe.global/core-api/transaction-service-overview).
4.  **Tokens**: Add an initial list of common tokens (USDC, WETH, etc.).

---

## Best Practices

*   **Scoping**: Always use `stateManager.getTokens(chainId)` to ensure you are using tokens valid for the active chain.
*   **Abstraction**: Keep the ABI definitions in `src/abis.ts` to keep the services clean.
*   **Error Handling**: Always check if a service is available on the current chain (`if (!this.myService) ...`) before proceeding.
