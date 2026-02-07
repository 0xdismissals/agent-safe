/**
 * Safe Wallet Skill POC for OpenClaw/ClawDBot
 * 
 * A skill that creates an agent EOA, deploys a 2/2 Safe on Base,
 * and enables basic wallet operations with user co-signing via Safe UI.
 */

import { type Address, type Hex, getAddress } from 'viem';
import { WizardOrchestrator } from './orchestrator/WizardOrchestrator.js';
import { SafeOperations } from './operations/SafeOperations.js';
import { WizardState } from './state/types.js';
import { getChainConfig, SUPPORTED_CHAINS } from './config.js';
import { type ChainConfig } from './types.js';

// Local configuration
const DEFAULT_CHAIN_ID = '84532'; // Base Sepolia

/**
 * Main skill interface
 */
export class SafeWalletSkill {
    private wizard: WizardOrchestrator;
    private operations: SafeOperations | null = null;
    private config: ChainConfig;

    constructor(chainId?: bigint) {
        // Resolve chain config
        const effectiveChainId = chainId || BigInt(process.env.CHAIN_ID || DEFAULT_CHAIN_ID);
        this.config = getChainConfig(effectiveChainId);

        this.wizard = new WizardOrchestrator(this.config);
    }

    /**
     * Initialize the skill by loading the wallet
     */
    async init() {
        return this.wizard.start();
    }

    // ============================================
    // Wizard Commands
    // ============================================

    /**
     * wizard.start() - Create agent wallet
     */
    async wizardStart() {
        return this.wizard.start();
    }

    /**
     * wizard.check_agent_funds(minEth) - Check agent EOA balance
     */
    async wizardCheckAgentFunds(minEth?: number) {
        return this.wizard.checkAgentFunds(minEth);
    }

    /**
     * wizard.set_owner_address(ownerAddress) - Set user's signer address (Legacy/Single)
     */
    async wizardSetOwnerAddress(ownerAddress: string) {
        return this.wizard.addOwnerAddress(ownerAddress);
    }

    /**
     * wizard.add_owner_address(ownerAddress) - Add multiple user signer addresses
     */
    async wizardAddOwnerAddress(ownerAddress: string) {
        return this.wizard.addOwnerAddress(ownerAddress);
    }

    /**
     * wizard.get_deploy_overview() - Show deployment overview before deploying
     */
    async wizardGetDeployOverview(threshold?: number) {
        return this.wizard.getDeployOverview(threshold);
    }

    /**
     * wizard.deploy_safe() - Deploy the Safe (n/m)
     */
    async wizardDeploySafe(threshold?: number) {
        return this.wizard.deploySafe(threshold);
    }

    // ============================================
    // Safe Operation Commands
    // ============================================

    /**
     * Initialize Safe operations (required before Safe commands)
     */
    private async ensureOperations(): Promise<SafeOperations> {
        if (this.operations) {
            return this.operations;
        }

        const safeAddress = this.wizard.getSafeAddress();
        if (!safeAddress) {
            throw new Error('Safe not deployed yet. Complete the wizard first.');
        }

        const agentAddress = this.wizard.getAgentAddress();
        const privateKey = this.wizard.getAgentPrivateKey();
        const stateManager = this.wizard.getStateManager();

        this.operations = new SafeOperations(
            safeAddress,
            agentAddress,
            privateKey,
            stateManager,
            this.config
        );

        return this.operations;
    }

    /**
     * safe.get_balances() - Get Safe ETH and token balances
     */
    async safeGetBalances() {
        const ops = await this.ensureOperations();
        const balances = await ops.getBalances();
        const summary = await ops.getBalanceSummary();
        return { balances, summary };
    }

    /**
     * safe.get_yields() - Get top yield opportunities from DefiLlama
     */
    async safeGetYields() {
        const ops = await this.ensureOperations();
        return ops.getYieldSummary();
    }

    /**
     * safe.propose_send_eth(to, amountEth) - Propose ETH transfer
     */
    async safeProposeSendETH(to: Address, amountEth: string) {
        const ops = await this.ensureOperations();
        return ops.proposeSendETH(to, amountEth);
    }

    /**
     * safe.propose_send_erc20(tokenAddressOrSymbol, to, amount) - Propose token transfer
     */
    async safeProposeSendERC20(tokenAddressOrSymbol: string, to: Address, amount: string) {
        const ops = await this.ensureOperations();
        return ops.proposeSendERC20(tokenAddressOrSymbol, to, amount);
    }

    /**
     * safe.check_proposal_status(safeTxHash) - Check proposal confirmations
     */
    async safeCheckProposalStatus(safeTxHash: Hex) {
        const ops = await this.ensureOperations();
        return ops.checkProposalStatus(safeTxHash);
    }

    /**
     * Add a custom token to the allowlist
     */
    async safeAddToken(symbol: string, address: Address, decimals: number) {
        const ops = await this.ensureOperations();
        return ops.addToken(symbol, address, decimals);
    }

    /**
     * safe.list_safes() - List all recorded Safes
     */
    async safeListSafes() {
        const safes = this.wizard.getStateManager().getSafes();
        if (safes.length === 0) {
            return { summary: "No Safes recorded yet.", safes: [] };
        }

        const table = safes.map(s => ({
            Address: s.address,
            Chain: s.chainName,
            ID: s.chainId.toString(),
            Threshold: s.threshold
        }));

        let summary = "Recorded Safes:\n";
        summary += table.map(s => `- ${s.Address} on ${s.Chain} (${s.Threshold}/${s.Threshold + 1}?)`).join("\n");
        // wait, threshold logic depends on owner count. 
        // Let's just show the threshold.
        summary = "Recorded Safes:\n";
        summary += safes.map(s => `- ${s.address} [${s.chainName}] (${s.threshold}/${s.owners.length} owners)`).join("\n");

        return { summary, safes };
    }

    /**
     * safe.select_safe(address) - Switch active Safe
     */
    async safeSelectSafe(address: string) {
        const checksummed = getAddress(address) as Address;
        const safes = this.wizard.getStateManager().getSafes();
        const found = safes.find(s => s.address.toLowerCase() === checksummed.toLowerCase());

        if (!found) {
            throw new Error(`Safe ${address} not found in registry.`);
        }

        // Update state
        this.wizard.getStateManager().setActiveSafe(checksummed);

        // If chain is different, we must re-initialize config
        if (found.chainId !== this.config.chainId) {
            this.config = getChainConfig(found.chainId);
            // Reset operations to force re-init with new config
            this.operations = null;
            // Also need to tell wizard about new config? 
            // WizardOrchestrator is initialized with config. I should update it or recreate it.
            // I'll add a way to update config in WizardOrchestrator.
            this.wizard = new WizardOrchestrator(this.config);

            return {
                message: `✓ Switched to Safe ${checksummed} on ${found.chainName}. (Note: Chain also switched to ${found.chainId})`,
                safe: found
            };
        }

        // Same chain, just reset operations to picking up new address
        this.operations = null;

        return {
            message: `✓ Switched to Safe ${checksummed} on ${found.chainName}.`,
            safe: found
        };
    }

    /**
     * safe.execute_if_ready(safeTxHash) - Execute if threshold met
     */
    async safeExecuteIfReady(safeTxHash: Hex) {
        const ops = await this.ensureOperations();
        return ops.executeIfReady(safeTxHash);
    }

    // ============================================
    // Swap Commands (Uniswap V3)
    // ============================================

    /**
     * safe.get_swap_quote(fromToken, toToken, amount) - Get a swap quote
     */
    async safeGetSwapQuote(fromToken: string, toToken: string, amount: string) {
        const ops = await this.ensureOperations();
        return ops.getSwapQuote(fromToken, toToken, amount);
    }

    /**
     * safe.propose_swap(fromToken, toToken, amount) - Propose a token swap
     */
    async safeProposeSwap(fromToken: string, toToken: string, amount: string) {
        const ops = await this.ensureOperations();
        return ops.proposeSwap(fromToken, toToken, amount);
    }

    /**
     * safe.agent_sign(safeTxHash) - Sign a pending transaction as the agent
     * Use when user proposes a tx and agent needs to add their signature
     */
    async safeAgentSign(safeTxHash: Hex) {
        const ops = await this.ensureOperations();
        return ops.agentSignTransaction(safeTxHash);
    }

    // ============================================
    // ETH ↔ WETH Wrap/Unwrap
    // ============================================

    /**
     * safe.wrap_eth(amount) - Wrap ETH to WETH
     */
    async safeWrapETH(amount: string) {
        const ops = await this.ensureOperations();
        return ops.proposeWrapETH(amount);
    }

    /**
     * safe.unwrap_weth(amount) - Unwrap WETH to ETH
     */
    async safeUnwrapWETH(amount: string) {
        const ops = await this.ensureOperations();
        return ops.proposeUnwrapWETH(amount);
    }

    // ============================================
    // Aave V3 Lending
    // ============================================

    /**
     * safe.aave_deposit(token, amount) - Deposit tokens to Aave to earn yield
     */
    async safeAaveDeposit(token: string, amount: string) {
        const ops = await this.ensureOperations();
        return ops.proposeAaveDeposit(token, amount);
    }

    /**
     * safe.aave_withdraw(token, amount) - Withdraw tokens from Aave
     * Use 'max' as amount to withdraw all (including earned interest)
     */
    async safeAaveWithdraw(token: string, amount: string) {
        const ops = await this.ensureOperations();
        return ops.proposeAaveWithdraw(token, amount);
    }

    /**
     * safe.aave_faucet(token, amount) - Request testnet tokens from Aave Faucet
     */
    async safeAaveFaucet(token: string, amount: string) {
        const ops = await this.ensureOperations();
        await ops.init();
        return ops.requestAaveFaucet(token, amount);
    }

    /**
     * Get current wizard state
     */
    getWizardState(): WizardState {
        return this.wizard.getState();
    }

    /**
     * Get Safe address (after deployment)
     */
    getSafeAddress(): Address | undefined {
        return this.wizard.getSafeAddress();
    }
}

// Export all types and classes
export { WizardOrchestrator } from './orchestrator/WizardOrchestrator.js';
export { SafeOperations } from './operations/SafeOperations.js';
export { KeyManager } from './services/KeyManager.js';
export { ChainRPCClient } from './services/ChainRPCClient.js';
export { BalanceService } from './services/BalanceService.js';
export { SafeService } from './services/SafeService.js';
export { SafeTxServiceClient } from './services/SafeTxServiceClient.js';
export { UniswapService } from './services/UniswapService.js';
export { AaveService } from './services/AaveService.js';
export { StateManager } from './state/StateManager.js';
export * from './state/types.js';
export * from './config.js';

// CLI demo (run with: npx tsx src/index.ts)
async function main() {
    const chainId = BigInt(process.env.CHAIN_ID || '84532');
    console.log('Safe Wallet Skill POC');
    console.log(`Active Chain: ${chainId} (Base Sepolia)`);
    console.log('=====================\n');

    const skill = new SafeWalletSkill();

    // Simple argument parsing for testing
    const args = process.argv.slice(2);
    const commandArg = args.find((_, i) => args[i - 1] === '--command');

    if (commandArg === 'balances') {
        console.log('Fetching Safe balances...');
        try {
            await skill.init();
            const result = await skill.safeGetBalances();
            console.log('\nResult:', result.summary);
        } catch (e: any) {
            console.error('\nError:', e.message);
        }
        return;
    }

    if (commandArg === 'yields' || commandArg === 'get_yields') {
        console.log('Fetching top yield opportunities from DefiLlama...');
        try {
            await skill.init();
            const result = await skill.safeGetYields();
            console.log('\n' + result);
        } catch (e: any) {
            console.error('\nError:', e.message);
        }
        return;
    }

    if (commandArg === 'deposit') {
        const token = args.find((_, i) => args[i - 1] === '--token') || 'USDC';
        const amount = args.find((_, i) => args[i - 1] === '--amount') || '1';
        console.log(`Executing deposit: ${amount} ${token}...`);
        try {
            await skill.init();
            const result = await skill.safeAaveDeposit(token, amount);
            console.log('\nResult:', JSON.stringify(result, null, 2));
        } catch (e: any) {
            console.error('\nError:', e.message);
        }
        return;
    }

    if (commandArg === 'list_safes') {
        console.log('Listing recorded Safes...');
        try {
            const result = await skill.safeListSafes();
            console.log('\n' + result.summary);
        } catch (e: any) {
            console.error('\nError:', e.message);
        }
        return;
    }

    if (commandArg === 'select_safe') {
        const addr = args.find((_, i) => args[i - 1] === '--address');
        if (!addr) {
            console.error('Error: Missing --address <ADDR> argument');
            return;
        }
        console.log(`Selecting Safe ${addr}...`);
        try {
            const result = await skill.safeSelectSafe(addr);
            console.log('\n' + result.message);
        } catch (e: any) {
            console.error('\nError:', e.message);
        }
        return;
    }

    if (commandArg === 'add_owner') {
        const owner = args.find((_, i) => args[i - 1] === '--address') || args.find((_, i) => args[i - 1] === '--owner');
        if (!owner) {
            console.error('Error: Missing --address <ADDRESS> argument');
            return;
        }
        console.log(`Adding owner address: ${owner}...`);
        try {
            await skill.init();
            const result = await skill.wizardAddOwnerAddress(owner);
            console.log('\nResult:', result.message);
        } catch (e: any) {
            console.error('\nError:', e.message);
        }
        return;
    }

    if (commandArg === 'add_token') {
        const symbol = args.find((_, i) => args[i - 1] === '--symbol') || args.find((_, i) => args[i - 1] === '--token');
        const address = args.find((_, i) => args[i - 1] === '--address') as Address;
        const decimals = parseInt(args.find((_, i) => args[i - 1] === '--decimals') || '18');
        if (!symbol || !address) {
            console.error('Error: Missing --symbol and --address arguments');
            return;
        }
        console.log(`Whitelisting token ${symbol} (${address})...`);
        try {
            await skill.init();
            const result = await skill.safeAddToken(symbol, address, decimals);
            console.log('\nResult:', result.message);
        } catch (e: any) {
            console.error('\nError:', e.message);
        }
        return;
    }

    if (commandArg === 'deploy' || commandArg === 'deploy_safe') {
        const threshold = args.find((_, i) => args[i - 1] === '--threshold');
        console.log(`Deploying Safe...`);
        try {
            await skill.init();
            const result = await skill.wizardDeploySafe(threshold ? parseInt(threshold) : undefined);
            console.log('\nResult:', result.instructions);
        } catch (e: any) {
            console.error('\nError:', e.message);
        }
        return;
    }

    if (commandArg === 'faucet') {
        const tokenFaucet = args.find((_, i) => i > 0 && args[i - 1] === '--token') || 'USDC';
        const amountFaucet = args.find((_, i) => i > 0 && args[i - 1] === '--amount') || '1000';
        console.log(`Requesting ${amountFaucet} ${tokenFaucet} from faucet...`);
        try {
            await skill.init();
            const result = await skill.safeAaveFaucet(tokenFaucet, amountFaucet);
            console.log('\nResult:', JSON.stringify(result, null, 2));
        } catch (e: any) {
            console.error('\nError:', e.message);
        }
        return;
    }

    if (commandArg === 'check_status') {
        const hash = args.find((_, i) => args[i - 1] === '--hash') as Hex;
        if (!hash) {
            console.error('Error: Mission --hash argument');
            return;
        }
        console.log(`Checking status for: ${hash}...`);
        try {
            await skill.init();
            const result = await skill.safeCheckProposalStatus(hash);
            console.log('\nResult:', JSON.stringify(result, null, 2));
        } catch (e: any) {
            console.error('\nError:', e.message);
        }
        return;
    }

    const state = skill.getWizardState();
    console.log(`Current state: ${state}`);

    if (state === WizardState.INIT) {
        console.log('\nRun: skill.wizardStart() to create agent wallet');
    } else if (state === WizardState.AGENT_WALLET_CREATED || state === WizardState.AWAIT_USER_FUNDS_CONFIRMATION) {
        console.log('\nRun: skill.wizardCheckAgentFunds() to check balance');
    } else if (state === WizardState.AWAIT_OWNER_ADDRESS) {
        console.log('\nRun: skill.wizardSetOwnerAddress("<your-address>") to set owner');
    } else if (state === WizardState.READY_TO_DEPLOY_SAFE) {
        console.log('\nRun: skill.wizardDeploySafe() to deploy Safe');
    } else if (state === WizardState.SAFE_DEPLOYED || state === WizardState.READY) {
        const safeAddress = skill.getSafeAddress();
        console.log(`\nSafe deployed: ${safeAddress}`);
        console.log('\nAvailable commands:');
        console.log('- skill.safeGetBalances()');
        console.log('- skill.safeProposeSendETH(to, amount)');
        console.log('- skill.safeProposeSendERC20(token, to, amount)');
        console.log('- skill.safeCheckProposalStatus(hash)');
        console.log('- skill.safeExecuteIfReady(hash)');
        console.log('- skill.safeAaveDeposit(token, amount)');
        console.log('- skill.safeAaveWithdraw(token, amount)');
        console.log('- skill.safeAaveFaucet(token, amount)');
        console.log('- skill.safeProposeSwap(from, to, amount)');
        console.log('- skill.safeGetYields()');
        console.log('- skill.safeWrapETH(amount)');
        console.log('- skill.safeUnwrapWETH(amount)');
    }
}

// Run if executed directly
main().catch(console.error);
