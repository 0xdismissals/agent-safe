import type { Address, Hex } from 'viem';
import { type TokenConfig } from '../types.js';

export interface SafeRecord {
    address: Address;
    chainId: bigint;
    chainName: string;
    owners: Address[];
    threshold: number;
    createdAt: string;
}

export type SafeRegistry = SafeRecord[];

/**
 * Wizard states for the setup flow
 */
export enum WizardState {
    INIT = 'INIT',
    AGENT_WALLET_CREATED = 'AGENT_WALLET_CREATED',
    AWAIT_USER_FUNDS_CONFIRMATION = 'AWAIT_USER_FUNDS_CONFIRMATION',
    AWAIT_OWNER_ADDRESS = 'AWAIT_OWNER_ADDRESS',
    READY_TO_DEPLOY_SAFE = 'READY_TO_DEPLOY_SAFE',
    SAFE_DEPLOYED = 'SAFE_DEPLOYED',
    READY = 'READY',
}

/**
 * Proposal status for Safe transactions
 */
export enum ProposalStatus {
    DRAFT = 'DRAFT',
    PROPOSED = 'PROPOSED',
    OWNER_CONFIRMED = 'OWNER_CONFIRMED',
    EXECUTED = 'EXECUTED',
    FAILED = 'FAILED',
}

/**
 * A proposed transaction
 */
export interface Proposal {
    safeTxHash: Hex;
    status: ProposalStatus;
    description: string;
    to: Address;
    value: string;
    data: Hex;
    createdAt: string;
    executedTxHash?: Hex;
    // Swap-specific metadata
    swapDetails?: {
        fromToken: string;
        toToken: string;
        fromAmount: string;
        expectedToAmount: string;
        minToAmount: string;
    };
}

/**
 * Persistent skill state
 */
export interface SkillState {
    wizardState: WizardState;
    agentAddress?: Address;
    ownerAddresses: Address[];
    safeAddress?: Address;
    deployTxHash?: Hex;
    proposals: Record<Hex, Proposal>;
    customTokens: Record<string, TokenConfig[]>; // chainId -> custom tokens
    createdAt: string;
    updatedAt: string;
}

/**
 * Create initial state
 */
export function createInitialState(): SkillState {
    const now = new Date().toISOString();
    return {
        wizardState: WizardState.INIT,
        ownerAddresses: [],
        proposals: {},
        customTokens: {},
        createdAt: now,
        updatedAt: now,
    };
}
