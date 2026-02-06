import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { type Hex, type Address } from 'viem';
import { type TokenConfig } from '../types.js';
import { DATA_DIR, STATE_FILE } from '../config.js';
import {
    type SkillState,
    type Proposal,
    type SafeRecord,
    type SafeRegistry,
    WizardState,
    ProposalStatus,
    createInitialState,
} from './types.js';

/**
 * StateManager handles persistent state storage
 */
export class StateManager {
    private dataDir: string;
    private statePath: string;
    private safesPath: string;
    private state: SkillState;
    private safes: SafeRegistry;

    constructor() {
        this.dataDir = join(homedir(), DATA_DIR);
        this.statePath = join(this.dataDir, STATE_FILE);
        this.safesPath = join(this.dataDir, 'safes.json');
        this.ensureDataDir();
        this.state = this.loadState();
        this.safes = this.loadSafes();
    }

    private ensureDataDir(): void {
        if (!existsSync(this.dataDir)) {
            mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
        }
    }

    private loadState(): SkillState {
        if (existsSync(this.statePath)) {
            try {
                return JSON.parse(readFileSync(this.statePath, 'utf8'));
            } catch {
                console.warn('Failed to load state, creating new state');
                return createInitialState();
            }
        }
        return createInitialState();
    }

    private saveState(): void {
        this.state.updatedAt = new Date().toISOString();
        writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    }

    private loadSafes(): SafeRegistry {
        if (existsSync(this.safesPath)) {
            try {
                const data = readFileSync(this.safesPath, 'utf8');
                return JSON.parse(data, (key, value) => {
                    if (key === 'chainId') return BigInt(value);
                    return value;
                });
            } catch {
                console.warn('Failed to load Safes registry, creating new one');
                return [];
            }
        }
        return [];
    }

    private saveSafes(): void {
        const data = JSON.stringify(this.safes, (key, value) => {
            if (typeof value === 'bigint') return value.toString();
            return value;
        }, 2);
        writeFileSync(this.safesPath, data, { mode: 0o600 });
    }

    /**
     * Get current state
     */
    getState(): SkillState {
        return { ...this.state };
    }

    /**
     * Get wizard state
     */
    getWizardState(): WizardState {
        return this.state.wizardState;
    }

    /**
     * Update wizard state
     */
    setWizardState(state: WizardState): void {
        this.state.wizardState = state;
        this.saveState();
    }

    /**
     * Set agent address
     */
    setAgentAddress(address: `0x${string}`): void {
        this.state.agentAddress = address;
        this.saveState();
    }

    /**
     * Add an owner address
     */
    addOwnerAddress(address: Address): void {
        if (!this.state.ownerAddresses.includes(address)) {
            this.state.ownerAddresses.push(address);
            this.saveState();
        }
    }

    /**
     * Clear all owners
     */
    clearOwners(): void {
        this.state.ownerAddresses = [];
        this.saveState();
    }

    /**
     * Set Safe address after deployment
     */
    setSafeDeployed(safeAddress: `0x${string}`, deployTxHash: Hex): void {
        this.state.safeAddress = safeAddress;
        this.state.deployTxHash = deployTxHash;
        this.state.wizardState = WizardState.SAFE_DEPLOYED;
        this.saveState();
    }

    /**
     * Mark setup as complete
     */
    setReady(): void {
        this.state.wizardState = WizardState.READY;
        this.saveState();
    }

    /**
     * Add a new proposal
     */
    addProposal(proposal: Proposal): void {
        this.state.proposals[proposal.safeTxHash] = proposal;
        this.saveState();
    }

    /**
     * Update proposal status
     */
    updateProposalStatus(safeTxHash: Hex, status: ProposalStatus, executedTxHash?: Hex): void {
        if (this.state.proposals[safeTxHash]) {
            this.state.proposals[safeTxHash].status = status;
            if (executedTxHash) {
                this.state.proposals[safeTxHash].executedTxHash = executedTxHash;
            }
            this.saveState();
        }
    }

    /**
     * Get a proposal by hash
     */
    getProposal(safeTxHash: Hex): Proposal | undefined {
        return this.state.proposals[safeTxHash];
    }

    /**
     * Get all pending proposals
     */
    getPendingProposals(): Proposal[] {
        return Object.values(this.state.proposals).filter(
            p => p.status === ProposalStatus.PROPOSED || p.status === ProposalStatus.OWNER_CONFIRMED
        );
    }

    /**
     * Add a custom token for a chain
     */
    addCustomToken(chainId: bigint, token: TokenConfig): void {
        const chainIdStr = chainId.toString();
        if (!this.state.customTokens[chainIdStr]) {
            this.state.customTokens[chainIdStr] = [];
        }

        // Avoid duplicates
        const exists = this.state.customTokens[chainIdStr].some(
            t => t.address.toLowerCase() === token.address.toLowerCase()
        );

        if (!exists) {
            this.state.customTokens[chainIdStr].push(token);
            this.saveState();
        }
    }

    /**
     * Get merged list of hardcoded and custom tokens for a chain
     */
    getTokens(chainId: bigint, defaultTokens: TokenConfig[]): TokenConfig[] {
        const custom = this.state.customTokens[chainId.toString()] || [];
        // Unique by address
        const merged = [...defaultTokens];
        for (const ct of custom) {
            if (!merged.some(t => t.address.toLowerCase() === ct.address.toLowerCase())) {
                merged.push(ct);
            }
        }
        return merged;
    }

    /**
     * Record a newly deployed Safe in the registry
     */
    recordSafe(safe: SafeRecord): void {
        // Avoid duplicate addresses on same chain
        const exists = this.safes.some(
            s => s.address.toLowerCase() === safe.address.toLowerCase() && s.chainId === safe.chainId
        );

        if (!exists) {
            this.safes.push(safe);
            this.saveSafes();
        }
    }

    /**
     * Get all recorded Safes
     */
    getSafes(): SafeRegistry {
        return [...this.safes];
    }

    /**
     * Get Safes for a specific chain
     */
    getSafesByChain(chainId: bigint): SafeRegistry {
        return this.safes.filter(s => s.chainId === chainId);
    }

    /**
     * Update active Safe in current state
     */
    setActiveSafe(address: Address): void {
        this.state.safeAddress = address;
        this.saveState();
    }

    /**
     * Reset state (for testing/development)
     */
    reset(): void {
        this.state = createInitialState();
        this.saveState();
    }
}
