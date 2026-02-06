import { isAddress, getAddress, type Address, type Hex, parseEther } from 'viem';
import { KeyManager } from '../services/KeyManager.js';
import { ChainRPCClient } from '../services/ChainRPCClient.js';
import { SafeService } from '../services/SafeService.js';
import { StateManager } from '../state/StateManager.js';
import { WizardState } from '../state/types.js';
import { MIN_DEPLOY_ETH } from '../config.js';
import { type ChainConfig } from '../types.js';

export interface WizardStartResult {
    agentAddress: Address;
    instructions: string;
}

export interface CheckFundsResult {
    balanceEth: string;
    balanceWei: bigint;
    minRequired: string;
    ok: boolean;
    message: string;
}

export interface SetOwnerResult {
    ownerAddress: Address;
    message: string;
}

export interface DeployOverview {
    chain: string;
    owners: Address[];
    threshold: number;
    deployer: Address;
    estimatedCost: string;
}

export interface DeploySafeResult {
    safeAddress: Address;
    deployTxHash: Hex;
    instructions: string;
}

/**
 * WizardOrchestrator handles the setup wizard flow
 */
export class WizardOrchestrator {
    private stateManager: StateManager;
    private keyManager: KeyManager;
    private rpcClient: ChainRPCClient;
    private config: ChainConfig;

    constructor(config: ChainConfig) {
        this.stateManager = new StateManager();
        this.keyManager = new KeyManager();
        this.config = config;
        this.rpcClient = new ChainRPCClient(config.rpcUrl, config.chainId);
    }

    /**
     * Get current wizard state
     */
    getState(): WizardState {
        return this.stateManager.getWizardState();
    }

    /**
     * Step 1: Create agent wallet
     */
    async start(): Promise<WizardStartResult> {
        const currentState = this.stateManager.getWizardState();

        // If wallet already exists, load it
        if (this.keyManager.walletExists()) {
            const { agentAddress } = await this.keyManager.loadWallet();
            this.stateManager.setAgentAddress(agentAddress as `0x${string}`);

            if (currentState === WizardState.INIT) {
                this.stateManager.setWizardState(WizardState.AGENT_WALLET_CREATED);
            }

            return {
                agentAddress,
                instructions: `Agent wallet already exists.\n\nAgent Address: ${agentAddress}\n\nSend at least ${MIN_DEPLOY_ETH} ETH to this address on ${this.config.name} for deployment gas, then tell me once sent.`,
            };
        }

        // Create new wallet
        const { agentAddress } = await this.keyManager.createWallet();
        this.stateManager.setAgentAddress(agentAddress as `0x${string}`);
        this.stateManager.setWizardState(WizardState.AGENT_WALLET_CREATED);

        return {
            agentAddress,
            instructions: `Agent wallet created!\n\nAgent Address: ${agentAddress}\n\nSend at least ${MIN_DEPLOY_ETH} ETH to this address on ${this.config.name} for deployment gas, then tell me once sent.`,
        };
    }

    /**
     * Step 2: Check if agent has enough funds
     */
    async checkAgentFunds(minEth: number = MIN_DEPLOY_ETH): Promise<CheckFundsResult> {
        await this.ensureWalletLoaded();

        const agentAddress = this.keyManager.getAddress();
        const balanceWei = await this.rpcClient.getBalance(agentAddress);
        const balanceEth = this.rpcClient.formatEther(balanceWei);
        const minWei = parseEther(minEth.toString());
        const ok = balanceWei >= minWei;

        if (ok) {
            this.stateManager.setWizardState(WizardState.AWAIT_OWNER_ADDRESS);
        } else {
            this.stateManager.setWizardState(WizardState.AWAIT_USER_FUNDS_CONFIRMATION);
        }

        return {
            balanceEth,
            balanceWei,
            minRequired: minEth.toString(),
            ok,
            message: ok
                ? `✓ Agent has ${balanceEth} ETH. Ready to proceed!\n\nPlease provide your signer EOA address (the wallet you use in Safe UI).`
                : `Agent balance: ${balanceEth} ETH\nRequired: ${minEth} ETH\n\nPlease send more ETH to ${agentAddress} and try again.`,
        };
    }

    /**
     * Step 3: Add an owner address (can be called multiple times)
     */
    async addOwnerAddress(ownerAddress: string): Promise<SetOwnerResult> {
        await this.ensureWalletLoaded();

        // Validate address format
        if (!isAddress(ownerAddress)) {
            throw new Error(`Invalid address format: ${ownerAddress}`);
        }

        // Checksum the address
        const checksummedAddress = getAddress(ownerAddress) as Address;

        // Ensure it's not the same as agent address
        const agentAddress = this.keyManager.getAddress();
        if (checksummedAddress.toLowerCase() === agentAddress.toLowerCase()) {
            throw new Error('Owner address cannot be the same as the agent address.');
        }

        this.stateManager.addOwnerAddress(checksummedAddress);
        this.stateManager.setWizardState(WizardState.READY_TO_DEPLOY_SAFE);

        const ownersCount = this.stateManager.getState().ownerAddresses.length;

        return {
            ownerAddress: checksummedAddress,
            message: `Owner address added: ${checksummedAddress} (Total owners: ${ownersCount + 1})\n\nYou can add more owners or run deploy_safe() to proceed.`,
        };
    }

    /**
     * Get deployment overview before deploying
     */
    async getDeployOverview(threshold?: number): Promise<DeployOverview> {
        await this.ensureWalletLoaded();

        const state = this.stateManager.getState();
        if (state.ownerAddresses.length === 0) {
            throw new Error('No owner addresses set. Run addOwnerAddress() first.');
        }

        const agentAddress = this.keyManager.getAddress();
        const allOwners = [agentAddress, ...state.ownerAddresses];
        const effectiveThreshold = threshold || allOwners.length;

        return {
            chain: this.config.name,
            owners: allOwners,
            threshold: effectiveThreshold,
            deployer: agentAddress,
            estimatedCost: '~0.0003 ETH',
        };
    }

    /**
     * Step 4: Deploy Safe
     */
    async deploySafe(threshold?: number): Promise<DeploySafeResult> {
        await this.ensureWalletLoaded();

        const state = this.stateManager.getState();
        if (state.wizardState !== WizardState.READY_TO_DEPLOY_SAFE) {
            throw new Error(`Cannot deploy Safe in current state: ${state.wizardState}`);
        }

        if (state.ownerAddresses.length === 0) {
            throw new Error('No owner addresses set.');
        }

        const agentAddress = this.keyManager.getAddress();
        const privateKey = this.keyManager.getPrivateKey();

        // Initialize Safe service
        const safeService = new SafeService(privateKey);
        const owners = [agentAddress, ...state.ownerAddresses];
        const effectiveThreshold = threshold || owners.length;

        // Predict and deploy
        await safeService.initForDeployment(owners, effectiveThreshold, this.config.rpcUrl);
        const { safeAddress, txHash } = await safeService.deploySafe(this.config.chainId);

        // Update state
        this.stateManager.setSafeDeployed(safeAddress as `0x${string}`, txHash);
        this.stateManager.recordSafe({
            address: safeAddress as `0x${string}`,
            chainId: this.config.chainId,
            chainName: this.config.name,
            owners: owners,
            threshold: effectiveThreshold,
            createdAt: new Date().toISOString(),
        });
        this.stateManager.setReady();

        const instructions = `
Safe deployed successfully!

Safe Address: ${safeAddress}
Deploy TX: ${txHash}
Chain: ${this.config.name}
Owners: ${owners.length}
Threshold: ${effectiveThreshold}

Next steps:
1. Deposit ETH/tokens to the Safe address
2. Open Safe UI (app.safe.global) → Add network: ${this.config.name} → Import Safe by address
3. Use get_balances() to check Safe balances
4. Use propose_send_eth() or propose_send_erc20() to create transactions
5. Confirm pending transactions in Safe UI
6. Use execute_if_ready() to execute once confirmed
`.trim();

        return {
            safeAddress,
            deployTxHash: txHash,
            instructions,
        };
    }

    /**
     * Get the Safe address (after deployment)
     */
    getSafeAddress(): Address | undefined {
        return this.stateManager.getState().safeAddress;
    }

    /**
     * Get the agent private key (for SafeService)
     */
    getAgentPrivateKey(): Hex {
        return this.keyManager.getPrivateKey();
    }

    /**
     * Get the agent address
     */
    getAgentAddress(): Address {
        return this.keyManager.getAddress();
    }

    /**
     * Get state manager (for operations)
     */
    getStateManager(): StateManager {
        return this.stateManager;
    }

    private async ensureWalletLoaded(): Promise<void> {
        if (!this.keyManager.walletExists()) {
            throw new Error('No wallet found. Run start() first.');
        }
        await this.keyManager.loadWallet();
    }
}
