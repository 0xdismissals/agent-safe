import { type Address, type Hex } from 'viem';

export interface TokenConfig {
    symbol: string;
    address: Address;
    decimals: number;
}

export interface UniswapConfig {
    swapRouter: Address;
    quoterV2: Address;
    factory: Address;
    weth: Address;
    defaultPoolFee?: number;
}

export interface AaveConfig {
    pool: Address;
    poolAddressesProvider: Address;
    faucet?: Address;
}

export interface ChainConfig {
    name: string;
    chainId: bigint;
    rpcUrl: string;
    safeTxServiceUrl?: string;
    tokens: TokenConfig[];
    services: {
        uniswap?: UniswapConfig;
        aave?: AaveConfig;
    };
}
