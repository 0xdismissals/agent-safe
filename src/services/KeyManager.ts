import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { type Hex, type Address } from 'viem';
import { DATA_DIR, WALLET_FILE } from '../config.js';

interface WalletData {
    privateKey: Hex;
    address: Address;
}

/**
 * KeyManager handles local EOA key generation and storage.
 */
export class KeyManager {
    private dataDir: string;
    private walletPath: string;
    private account: PrivateKeyAccount | null = null;

    constructor() {
        this.dataDir = join(homedir(), DATA_DIR);
        this.walletPath = join(this.dataDir, WALLET_FILE);
        this.ensureDataDir();
    }

    private ensureDataDir(): void {
        if (!existsSync(this.dataDir)) {
            mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
        }
    }

    /**
     * Check if a wallet already exists
     */
    walletExists(): boolean {
        return existsSync(this.walletPath);
    }

    /**
     * Create a new wallet (EOA keypair)
     * @returns The agent's address
     */
    async createWallet(): Promise<{ agentAddress: Address }> {
        if (this.walletExists()) {
            throw new Error('Wallet already exists. Use loadWallet() to load it.');
        }

        const privateKey = generatePrivateKey();
        this.account = privateKeyToAccount(privateKey);

        const walletData: WalletData = {
            privateKey,
            address: this.account.address,
        };

        writeFileSync(this.walletPath, JSON.stringify(walletData, null, 2), { mode: 0o600 });

        return { agentAddress: this.account.address };
    }

    /**
     * Load an existing wallet from disk
     * @returns The agent's address
     */
    async loadWallet(): Promise<{ agentAddress: Address }> {
        if (!this.walletExists()) {
            throw new Error('No wallet found. Use createWallet() to create one.');
        }

        const walletData: WalletData = JSON.parse(readFileSync(this.walletPath, 'utf8'));

        this.account = privateKeyToAccount(walletData.privateKey);

        if (this.account.address.toLowerCase() !== walletData.address.toLowerCase()) {
            throw new Error('Wallet loading failed: address mismatch');
        }

        return { agentAddress: this.account.address };
    }

    /**
     * Get the loaded account
     */
    getAccount(): PrivateKeyAccount {
        if (!this.account) {
            throw new Error('No wallet loaded. Call createWallet() or loadWallet() first.');
        }
        return this.account;
    }

    /**
     * Get the agent's address
     */
    getAddress(): Address {
        return this.getAccount().address;
    }

    /**
     * Get the private key (for Safe SDK signer)
     * WARNING: Handle with care, never log this value
     */
    getPrivateKey(): Hex {
        const account = this.getAccount();
        // Since we store it in memory now, we can just return it from account?
        // Wait, viem Account doesn't expose privateKey directly easily if it's specialized.
        // Actually, we can just grab it from our in-memory account state or the file.
        const walletData: WalletData = JSON.parse(readFileSync(this.walletPath, 'utf8'));
        return walletData.privateKey;
    }

    /**
     * Sign a hash (for Safe transaction signing)
     */
    async signHash(hash: Hex): Promise<Hex> {
        const account = this.getAccount();
        return account.signMessage({ message: { raw: hash } });
    }
}
