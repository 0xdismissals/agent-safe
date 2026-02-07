import { type ChainConfig, type TokenConfig } from './types.js';

// Deployment configuration
export const MIN_DEPLOY_ETH = parseFloat(process.env.MIN_DEPLOY_ETH || '0.0005');

// Local storage paths
export const DATA_DIR = '.agent-safe';
export const WALLET_FILE = 'wallet.json';
export const STATE_FILE = 'state.json';

/**
 * Universal Chain Registry
 */
export const SUPPORTED_CHAINS: Record<string, ChainConfig> = {
    // === BASE ===
    '84532': {
        name: 'Base Sepolia',
        chainId: 84532n,
        rpcUrl: 'https://sepolia.base.org',
        llamaChainName: 'Base',
        tokens: [
            { symbol: 'USDC', address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', decimals: 6 },
            { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18 },
            { symbol: 'aaveUSDC', address: '0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f', decimals: 6 },
        ],
        services: {
            uniswap: {
                swapRouter: '0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4',
                quoterV2: '0xC5290058841028F1614F3A6F0F5816cAd0df5E27',
                factory: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
                weth: '0x4200000000000000000000000000000000000006',
            },
            aave: {
                pool: '0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27',
                poolAddressesProvider: '0xE4C23309117Aa30342BFaae6c95c6478e0A4Ad00',
                faucet: '0xD9145b5F45Ad4519c7ACcD6E0A4A82e83bB8A6Dc',
            }
        }
    },
    '8453': {
        name: 'Base',
        chainId: 8453n,
        rpcUrl: 'https://mainnet.base.org',
        safeTxServiceUrl: 'https://safe-transaction-base.safe.global/api',
        llamaChainName: 'Base',
        tokens: [
            { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
            { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18 },
        ],
        services: {
            uniswap: {
                swapRouter: '0x2626664c26023396193714A6F62EcA190740Fc03',
                quoterV2: '0x3d4e44Eb17746167C55F04815F100Ae440AD0101',
                factory: '0x33128a8fC170d56ED8068699e16bD4416954605f',
                weth: '0x4200000000000000000000000000000000000006',
            },
            aave: {
                pool: '0xA238Dd80C259a72e81d7e4674A983a5982BB8d30',
                poolAddressesProvider: '0xe20fCB59a43d9f98bBD23ef0bcB28b8E8B964D31',
            }
        }
    },
    // === ETHEREUM ===
    '1': {
        name: 'Ethereum',
        chainId: 1n,
        rpcUrl: 'https://eth.llamarpc.com',
        safeTxServiceUrl: 'https://api.safe.global/tx-service/mainnet',
        llamaChainName: 'Ethereum',
        tokens: [
            { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
            { symbol: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
        ],
        services: {
            uniswap: {
                swapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
                quoterV2: '0x61fFe014bA17989E743c5F6cB21bF9697530B21e',
                factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
                weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            },
            aave: {
                pool: '0x87870Bca3F5fD6331550B4FA4E2F8Cc59C3f4Cc',
                poolAddressesProvider: '0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e',
            }
        }
    },
    // === OPTIMISM ===
    '10': {
        name: 'Optimism',
        chainId: 10n,
        rpcUrl: 'https://mainnet.optimism.io',
        safeTxServiceUrl: 'https://api.safe.global/tx-service/optimism',
        llamaChainName: 'Optimism',
        tokens: [
            { symbol: 'USDC', address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6 },
            { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18 },
        ],
        services: {
            uniswap: {
                swapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
                quoterV2: '0x61fFe014bA17989E743c5F6cB21bF9697530B21e',
                factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
                weth: '0x4200000000000000000000000000000000000006',
            },
            aave: {
                pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
                poolAddressesProvider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
            }
        }
    },
    // === ARBITRUM ===
    '42161': {
        name: 'Arbitrum One',
        chainId: 42161n,
        rpcUrl: 'https://arb1.arbitrum.io/rpc',
        safeTxServiceUrl: 'https://api.safe.global/tx-service/arbitrum',
        llamaChainName: 'Arbitrum',
        tokens: [
            { symbol: 'USDC', address: '0xaf88d065e77c8cC2239326C0369123fe564597d8', decimals: 6 },
            { symbol: 'WETH', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
        ],
        services: {
            uniswap: {
                swapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
                quoterV2: '0x61fFe014bA17989E743c5F6cB21bF9697530B21e',
                factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
                weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            },
            aave: {
                pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
                poolAddressesProvider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
            }
        }
    },
    // === POLYGON ===
    '137': {
        name: 'Polygon',
        chainId: 137n,
        rpcUrl: 'https://polygon-rpc.com',
        safeTxServiceUrl: 'https://api.safe.global/tx-service/polygon',
        llamaChainName: 'Polygon',
        tokens: [
            { symbol: 'USDC', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 },
            { symbol: 'WETH', address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18 },
        ],
        services: {
            uniswap: {
                swapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
                quoterV2: '0x61fFe014bA17989E743c5F6cB21bF9697530B21e',
                factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
                weth: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
            },
            aave: {
                pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
                poolAddressesProvider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
            }
        }
    },
    // === BSC ===
    '56': {
        name: 'BNB Smart Chain',
        chainId: 56n,
        rpcUrl: 'https://bsc-dataseed.binance.org/',
        safeTxServiceUrl: 'https://api.safe.global/tx-service/bsc',
        llamaChainName: 'BSC',
        tokens: [
            { symbol: 'USDC', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
            { symbol: 'WETH', address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', decimals: 18 },
        ],
        services: {
            uniswap: {
                swapRouter: '0x1F98431c8aD98523631AE4a59f267346ea31F984', // PancakeSwap V3
                quoterV2: '0x61fFe014bA17989E743c5F6cB21bF9697530B21e',
                factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
                weth: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
            },
            aave: {
                pool: '0x6807dc92323e98d9751992955f55986979a7e0cb',
                poolAddressesProvider: '0xff75B67e231D9ebEF8BB4068225010859F0221D0',
            }
        }
    },
    // === GNOSIS ===
    '100': {
        name: 'Gnosis Chain',
        chainId: 100n,
        rpcUrl: 'https://rpc.gnosischain.com/',
        safeTxServiceUrl: 'https://api.safe.global/tx-service/gnosis-chain',
        llamaChainName: 'Gnosis',
        tokens: [
            { symbol: 'USDC', address: '0xddafbb505ad214d4b2e9e996e382b3c050a6122d', decimals: 6 },
            { symbol: 'WETH', address: '0x6A023CCd1ff6F2045C3309768eAd9E68F978f6e1', decimals: 18 },
        ],
        services: {
            aave: {
                pool: '0xb011c21823ebE040055761005576100557610055',
                poolAddressesProvider: '0x36616cf17557639664402b6e272f0f9fbe20c02d',
            }
        }
    },
    // === AVALANCHE ===
    '43114': {
        name: 'Avalanche C-Chain',
        chainId: 43114n,
        rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
        safeTxServiceUrl: 'https://api.safe.global/tx-service/avalanche',
        llamaChainName: 'Avalanche',
        tokens: [
            { symbol: 'USDC', address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', decimals: 6 },
            { symbol: 'WETH', address: '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB', decimals: 18 },
        ],
        services: {
            aave: {
                pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
                poolAddressesProvider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
            }
        }
    },
    // === UNICHAIN ===
    '130': {
        name: 'Unichain',
        chainId: 130n,
        rpcUrl: 'https://mainnet.unichain.org',
        llamaChainName: 'Unichain',
        tokens: [
            { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18 },
        ],
        services: {
            uniswap: {
                swapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
                quoterV2: '0x61fFe014bA17989E743c5F6cB21bF9697530B21e',
                factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
                weth: '0x4200000000000000000000000000000000000006',
            }
        }
    },
};

/**
 * Get configuration for a chain
 */
export function getChainConfig(chainId: bigint): ChainConfig {
    const config = SUPPORTED_CHAINS[chainId.toString()];
    if (!config) {
        throw new Error(`Chain ID ${chainId} not supported`);
    }
    return config;
}

// Fallback / Default (for non-refactored parts)
export const BASE_CHAIN_ID = 84532n;
export const BASE_RPC_URL = SUPPORTED_CHAINS['84532'].rpcUrl;
export const SAFE_TX_SERVICE_URL = SUPPORTED_CHAINS['84532'].safeTxServiceUrl!;
export const TOKEN_ALLOWLIST = SUPPORTED_CHAINS['84532'].tokens;
