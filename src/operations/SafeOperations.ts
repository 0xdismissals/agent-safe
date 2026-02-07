import { type Address, type Hex, parseEther, parseUnits, formatUnits, defineChain } from 'viem';
import { BalanceService, type Balances } from '../services/BalanceService.js';
import { SafeService } from '../services/SafeService.js';
import { SafeTxServiceClient } from '../services/SafeTxServiceClient.js';
import { UniswapService, type SwapQuoteResult } from '../services/UniswapService.js';
import { AaveService } from '../services/AaveService.js';
import { YieldService } from '../services/YieldService.js';
import { StateManager } from '../state/StateManager.js';
import { ProposalStatus, type Proposal } from '../state/types.js';
import { type ChainConfig } from '../types.js';

export interface SwapProposeResult {
    safeTxHash: Hex;
    summary: string;
    instructions: string;
    quote: SwapQuoteResult;
}

export interface ProposeResult {
    safeTxHash: Hex;
    summary: string;
    instructions: string;
}

export interface ProposalStatusResult {
    safeTxHash: Hex;
    confirmations: { owner: Address; submissionDate: string }[];
    confirmationsRequired: number;
    confirmedByOwner: boolean;
    readyToExecute: boolean;
    isExecuted: boolean;
    message: string;
}

export interface ExecuteResult {
    executed: boolean;
    execTxHash?: Hex;
    message: string;
}

/**
 * SafeOperations handles Safe wallet operations after deployment
 */
export class SafeOperations {
    private stateManager: StateManager;
    private balanceService: BalanceService;
    private safeService: SafeService;
    private txServiceClient: SafeTxServiceClient;
    private uniswapService: UniswapService;
    private aaveService: AaveService;
    private yieldService: YieldService;
    private safeAddress: Address;
    private agentAddress: Address;

    private config: ChainConfig;

    constructor(
        safeAddress: Address,
        agentAddress: Address,
        agentPrivateKey: Hex,
        stateManager: StateManager,
        config: ChainConfig
    ) {
        this.safeAddress = safeAddress;
        this.agentAddress = agentAddress;
        this.stateManager = stateManager;
        this.config = config;

        const mergedTokens = stateManager.getTokens(config.chainId, config.tokens);

        this.balanceService = new BalanceService(config.rpcUrl, config.chainId, mergedTokens);
        this.safeService = new SafeService(agentPrivateKey);
        this.txServiceClient = new SafeTxServiceClient(config.chainId, config.safeTxServiceUrl);
        this.yieldService = new YieldService();

        // Initialize optional services
        if (config.services.uniswap) {
            this.uniswapService = new UniswapService(
                config.services.uniswap,
                mergedTokens,
                config.rpcUrl,
                config.chainId
            );
        } else {
            // Placeholder/Null if not supported
            this.uniswapService = null as any;
        }

        if (config.services.aave) {
            this.aaveService = new AaveService(
                config.services.aave,
                mergedTokens,
                this.balanceService.getPublicClient() // I'll add getPublicClient to BalanceService
            );
        } else {
            this.aaveService = null as any;
        }
    }

    /**
     * Initialize Safe service connection
     */
    async init(): Promise<void> {
        await this.safeService.initForExistingSafe(this.safeAddress, this.config.rpcUrl);
    }

    /**
     * Get Safe balances (ETH + tokens)
     */
    async getBalances(): Promise<Balances> {
        return this.balanceService.getBalances(this.safeAddress);
    }

    /**
     * Get formatted balance summary
     */
    async getBalanceSummary(): Promise<string> {
        const balances = await this.getBalances();
        return this.balanceService.formatBalanceSummary(balances);
    }

    /**
     * Propose sending ETH from the Safe
     */
    async proposeSendETH(to: Address, amountEth: string): Promise<ProposeResult> {
        await this.init();

        const amountWei = parseEther(amountEth);

        // Build transaction
        const safeTx = await this.safeService.buildETHTransferTx(to, amountWei);

        // Get hash and sign
        const safeTxHash = await this.safeService.getTransactionHash(safeTx);
        const signature = await this.safeService.signTransactionHash(safeTxHash);

        // Propose to transaction service
        await this.txServiceClient.proposeTransaction(
            this.safeAddress,
            safeTx.data,
            safeTxHash,
            this.agentAddress,
            signature.data
        );

        // Save proposal to state
        const proposal: Proposal = {
            safeTxHash,
            status: ProposalStatus.PROPOSED,
            description: `Send ${amountEth} ETH to ${to}`,
            to,
            value: amountWei.toString(),
            data: '0x',
            createdAt: new Date().toISOString(),
        };
        this.stateManager.addProposal(proposal);

        return {
            safeTxHash,
            summary: `Proposed: Send ${amountEth} ETH to ${to}`,
            instructions: `Transaction proposed!\n\nSafeTxHash: ${safeTxHash}\n\nNext steps:\n1. Open Safe UI (app.safe.global)\n2. Go to Transactions → Queue\n3. Find and confirm the pending transaction\n4. Run check_proposal_status('${safeTxHash}') to verify\n5. Run execute_if_ready('${safeTxHash}') once confirmed`,
        };
    }

    /**
     * Propose sending ERC20 tokens from the Safe
     */
    async proposeSendERC20(
        tokenAddressOrSymbol: string,
        to: Address,
        amount: string
    ): Promise<ProposeResult> {
        await this.init();

        // Resolve token
        let tokenAddress: Address;
        let decimals: number;
        let symbol: string;

        const allTokens = this.stateManager.getTokens(this.config.chainId, this.config.tokens);
        const tokenConfig = allTokens.find(
            t => t.symbol.toLowerCase() === tokenAddressOrSymbol.toLowerCase() ||
                t.address.toLowerCase() === tokenAddressOrSymbol.toLowerCase()
        );

        if (tokenConfig) {
            tokenAddress = tokenConfig.address;
            decimals = tokenConfig.decimals;
            symbol = tokenConfig.symbol;
        } else {
            // Assume it's an address with 18 decimals
            tokenAddress = tokenAddressOrSymbol as Address;
            decimals = 18;
            symbol = 'TOKEN';
        }

        const amountRaw = parseUnits(amount, decimals);

        // Build transaction
        const safeTx = await this.safeService.buildERC20TransferTx(tokenAddress, to, amountRaw);

        // Get hash and sign
        const safeTxHash = await this.safeService.getTransactionHash(safeTx);
        const signature = await this.safeService.signTransactionHash(safeTxHash);

        // Propose to transaction service
        await this.txServiceClient.proposeTransaction(
            this.safeAddress,
            safeTx.data,
            safeTxHash,
            this.agentAddress,
            signature.data
        );

        // Save proposal to state
        const proposal: Proposal = {
            safeTxHash,
            status: ProposalStatus.PROPOSED,
            description: `Send ${amount} ${symbol} to ${to}`,
            to: tokenAddress,
            value: '0',
            data: safeTx.data.data as Hex,
            createdAt: new Date().toISOString(),
        };
        this.stateManager.addProposal(proposal);

        return {
            safeTxHash,
            summary: `Proposed: Send ${amount} ${symbol} to ${to}`,
            instructions: `Transaction proposed!\n\nSafeTxHash: ${safeTxHash}\n\nNext steps:\n1. Open Safe UI (app.safe.global)\n2. Go to Transactions → Queue\n3. Find and confirm the pending transaction\n4. Run check_proposal_status('${safeTxHash}') to verify\n5. Run execute_if_ready('${safeTxHash}') once confirmed`,
        };
    }

    /**
     * Check proposal status
     */
    async checkProposalStatus(safeTxHash: Hex): Promise<ProposalStatusResult> {
        const details = await this.txServiceClient.getTransactionDetails(safeTxHash);

        const confirmationsCount = details.confirmations.length;
        const readyToExecute = confirmationsCount >= details.confirmationsRequired && !details.isExecuted;

        // Update local state if owner confirmed
        if (confirmationsCount >= details.confirmationsRequired) {
            this.stateManager.updateProposalStatus(safeTxHash, ProposalStatus.OWNER_CONFIRMED);
        }

        if (details.isExecuted) {
            this.stateManager.updateProposalStatus(
                safeTxHash,
                ProposalStatus.EXECUTED,
                details.transactionHash || undefined
            );
        }

        let message = `Confirmations: ${confirmationsCount}/${details.confirmationsRequired}\n`;

        for (const conf of details.confirmations) {
            message += `- ${conf.owner} (${conf.submissionDate})\n`;
        }

        if (details.isExecuted) {
            message += `\n✓ Transaction already executed: ${details.transactionHash}`;
        } else if (readyToExecute) {
            message += `\n✓ Ready to execute! Run execute_if_ready('${safeTxHash}')`;
        } else {
            message += `\nWaiting for more confirmations. Please confirm in Safe UI.`;
        }

        return {
            safeTxHash,
            confirmations: details.confirmations.map(c => ({
                owner: c.owner,
                submissionDate: c.submissionDate,
            })),
            confirmationsRequired: details.confirmationsRequired,
            confirmedByOwner: confirmationsCount >= 2,
            readyToExecute,
            isExecuted: details.isExecuted,
            message,
        };
    }

    /**
     * Execute transaction if ready (threshold met)
     */
    async executeIfReady(safeTxHash: Hex): Promise<ExecuteResult> {
        await this.init();

        // Check status first
        const status = await this.checkProposalStatus(safeTxHash);

        if (status.isExecuted) {
            return {
                executed: false,
                message: `Transaction already executed.`,
            };
        }

        if (!status.readyToExecute) {
            return {
                executed: false,
                message: `Not ready to execute. ${status.confirmations.length}/${status.confirmationsRequired} confirmations.`,
            };
        }

        // Get full transaction from service
        const txResponse = await this.txServiceClient.getTransaction(safeTxHash);

        // Execute using the properly reconstructed transaction
        const { hash } = await this.safeService.executeTransactionFromService(txResponse);

        // Update state
        this.stateManager.updateProposalStatus(safeTxHash, ProposalStatus.EXECUTED, hash);

        return {
            executed: true,
            execTxHash: hash,
            message: `✓ Transaction executed!\n\nTx Hash: ${hash}\n\nView on BaseScan: https://basescan.org/tx/${hash}`,
        };
    }

    /**
     * Sign a pending transaction as the agent
     * Use this when the user proposes a transaction and the agent needs to add their signature
     */
    async agentSignTransaction(safeTxHash: Hex): Promise<{ signed: boolean; message: string }> {
        await this.init();

        // Check if transaction exists and isn't already executed
        const status = await this.checkProposalStatus(safeTxHash);

        if (status.isExecuted) {
            return {
                signed: false,
                message: `Transaction already executed.`,
            };
        }

        // Check if agent already signed
        const agentAlreadySigned = status.confirmations.some(
            c => c.owner.toLowerCase() === this.agentAddress.toLowerCase()
        );

        if (agentAlreadySigned) {
            return {
                signed: false,
                message: `Agent has already signed this transaction. ${status.confirmations.length}/${status.confirmationsRequired} confirmations.`,
            };
        }

        // Sign the transaction hash
        const signature = await this.safeService.signTransactionHash(safeTxHash);

        // Submit confirmation to transaction service
        await this.txServiceClient.confirmTransaction(safeTxHash, signature.data);

        // Check new status
        const newStatus = await this.checkProposalStatus(safeTxHash);

        return {
            signed: true,
            message: `✓ Agent signed transaction!\n\nSafeTxHash: ${safeTxHash}\nConfirmations: ${newStatus.confirmations.length}/${newStatus.confirmationsRequired}\n\n${newStatus.readyToExecute ? 'Transaction is ready to execute! Run safeExecuteIfReady().' : 'Waiting for more signatures.'}`,
        };
    }

    /**
     * Get pending proposals from local state
     */
    getPendingProposals(): Proposal[] {
        return this.stateManager.getPendingProposals();
    }

    /**
     * Add a custom token to the allowlist
     */
    addToken(symbol: string, address: Address, decimals: number): { success: boolean; message: string } {
        const token = { symbol, address, decimals };
        this.stateManager.addCustomToken(this.config.chainId, token);

        // Refresh services with new token list
        const mergedTokens = this.stateManager.getTokens(this.config.chainId, this.config.tokens);
        this.balanceService = new BalanceService(this.config.rpcUrl, this.config.chainId, mergedTokens);
        if (this.uniswapService) {
            this.uniswapService = new UniswapService(
                this.config.services.uniswap!,
                mergedTokens,
                this.config.rpcUrl,
                this.config.chainId
            );
        }
        if (this.aaveService) {
            this.aaveService = new AaveService(
                this.config.services.aave!,
                mergedTokens,
                this.balanceService.getPublicClient()
            );
        }

        return {
            success: true,
            message: `✓ Token ${symbol} (${address}) added to the allowlist on ${this.config.name}.`,
        };
    }

    // ============================================
    // Swap Operations (Uniswap V3)
    // ============================================

    /**
     * Get a quote for swapping tokens via Uniswap V3
     */
    async getSwapQuote(
        fromToken: string,
        toToken: string,
        amount: string
    ): Promise<SwapQuoteResult> {
        return this.uniswapService.getQuote(fromToken, toToken, amount);
    }

    /**
     * Propose a token swap via Uniswap V3
     * For ERC20 → token swaps, this batches approve + swap in one transaction
     */
    async proposeSwap(
        fromToken: string,
        toToken: string,
        amount: string
    ): Promise<SwapProposeResult> {
        await this.init();

        // Get quote first
        const quote = await this.uniswapService.getQuote(fromToken, toToken, amount);

        // Check if swapping from native ETH
        const isNativeETH = this.uniswapService.isNativeETH(fromToken);

        // Build swap calldata
        const swapCalldata = this.uniswapService.buildSwapCalldata({
            tokenIn: quote.fromToken.address,
            tokenOut: quote.toToken.address,
            amountIn: BigInt(quote.fromToken.amountRaw),
            amountOutMinimum: BigInt(quote.toToken.amountMinRaw),
            recipient: this.safeAddress,
        });

        let safeTx;
        let description: string;

        if (isNativeETH) {
            // For ETH swaps, just do the swap with ETH value
            safeTx = await this.safeService.buildRawTx(
                this.uniswapService.getSwapRouterAddress(),
                BigInt(quote.fromToken.amountRaw),
                swapCalldata
            );
            description = `Swap ${amount} ${quote.fromToken.symbol} → ${quote.toToken.amount} ${quote.toToken.symbol}`;
        } else {
            // For ERC20 swaps, batch: 1) approve + 2) swap
            const approveCalldata = this.uniswapService.buildApproveCalldata(
                this.uniswapService.getSwapRouterAddress(),
                BigInt(quote.fromToken.amountRaw)
            );

            safeTx = await this.safeService.buildBatchTx([
                // Transaction 1: Approve SwapRouter to spend tokens
                {
                    to: quote.fromToken.address,
                    value: 0n,
                    data: approveCalldata,
                },
                // Transaction 2: Execute the swap
                {
                    to: this.uniswapService.getSwapRouterAddress(),
                    value: 0n,
                    data: swapCalldata,
                },
            ]);
            description = `Approve + Swap ${amount} ${quote.fromToken.symbol} → ${quote.toToken.amount} ${quote.toToken.symbol}`;
        }

        // Get hash and sign
        const safeTxHash = await this.safeService.getTransactionHash(safeTx);
        const signature = await this.safeService.signTransactionHash(safeTxHash);

        // Propose to transaction service
        await this.txServiceClient.proposeTransaction(
            this.safeAddress,
            safeTx.data,
            safeTxHash,
            this.agentAddress,
            signature.data
        );

        // Save proposal to state
        const proposal: Proposal = {
            safeTxHash,
            status: ProposalStatus.PROPOSED,
            description,
            to: this.uniswapService.getSwapRouterAddress(),
            value: isNativeETH ? quote.fromToken.amountRaw : '0',
            data: swapCalldata,
            createdAt: new Date().toISOString(),
            swapDetails: {
                fromToken: quote.fromToken.symbol,
                toToken: quote.toToken.symbol,
                fromAmount: amount,
                expectedToAmount: quote.toToken.amount,
                minToAmount: quote.toToken.amountMin,
            },
        };
        this.stateManager.addProposal(proposal);

        const batchNote = isNativeETH ? '' : ' (includes token approval)';
        return {
            safeTxHash,
            summary: `Proposed: Swap ${amount} ${quote.fromToken.symbol} → ~${quote.toToken.amount} ${quote.toToken.symbol} (min: ${quote.toToken.amountMin})${batchNote}`,
            instructions: `Swap transaction proposed!${batchNote}\n\nSafeTxHash: ${safeTxHash}\n\nSwap Details:\n- From: ${amount} ${quote.fromToken.symbol}\n- To: ~${quote.toToken.amount} ${quote.toToken.symbol}\n- Min Output: ${quote.toToken.amountMin} ${quote.toToken.symbol}\n\nNext steps:\n1. Open Safe UI (app.safe.global)\n2. Go to Transactions → Queue\n3. Find and confirm the pending swap transaction\n4. Run check_proposal_status('${safeTxHash}') to verify\n5. Run execute_if_ready('${safeTxHash}') once confirmed`,
            quote,
        };
    }

    // ============================================
    // ETH ↔ WETH Wrap/Unwrap Operations
    // ============================================

    /**
     * Propose wrapping ETH to WETH
     * Deposits ETH into the WETH contract
     */
    async proposeWrapETH(amountEth: string): Promise<ProposeResult> {
        await this.init();

        const amountWei = parseEther(amountEth);
        const wrapCalldata = this.uniswapService.buildWrapCalldata();

        // Build Safe transaction - send ETH to WETH contract
        const safeTx = await this.safeService.buildRawTx(
            this.uniswapService.getWETHAddress(),
            amountWei,
            wrapCalldata
        );

        // Get hash and sign
        const safeTxHash = await this.safeService.getTransactionHash(safeTx);
        const signature = await this.safeService.signTransactionHash(safeTxHash);

        // Propose to transaction service
        await this.txServiceClient.proposeTransaction(
            this.safeAddress,
            safeTx.data,
            safeTxHash,
            this.agentAddress,
            signature.data
        );

        // Save proposal to state
        const proposal: Proposal = {
            safeTxHash,
            status: ProposalStatus.PROPOSED,
            description: `Wrap ${amountEth} ETH → WETH`,
            to: this.uniswapService.getWETHAddress(),
            value: amountWei.toString(),
            data: wrapCalldata,
            createdAt: new Date().toISOString(),
        };
        this.stateManager.addProposal(proposal);

        return {
            safeTxHash,
            summary: `Proposed: Wrap ${amountEth} ETH → WETH`,
            instructions: `Wrap ETH transaction proposed!\n\nSafeTxHash: ${safeTxHash}\n\nThis will convert ${amountEth} ETH to ${amountEth} WETH.\n\nNext steps:\n1. Open Safe UI (app.safe.global)\n2. Go to Transactions → Queue\n3. Find and confirm the pending wrap transaction\n4. Run execute_if_ready('${safeTxHash}') once confirmed`,
        };
    }

    /**
     * Propose unwrapping WETH to ETH
     * Withdraws ETH from the WETH contract
     */
    async proposeUnwrapWETH(amountWeth: string): Promise<ProposeResult> {
        await this.init();

        const amountWei = parseEther(amountWeth);
        const unwrapCalldata = this.uniswapService.buildUnwrapCalldata(amountWei);

        // Build Safe transaction - call withdraw on WETH contract
        const safeTx = await this.safeService.buildRawTx(
            this.uniswapService.getWETHAddress(),
            0n,
            unwrapCalldata
        );

        // Get hash and sign
        const safeTxHash = await this.safeService.getTransactionHash(safeTx);
        const signature = await this.safeService.signTransactionHash(safeTxHash);

        // Propose to transaction service
        await this.txServiceClient.proposeTransaction(
            this.safeAddress,
            safeTx.data,
            safeTxHash,
            this.agentAddress,
            signature.data
        );

        // Save proposal to state
        const proposal: Proposal = {
            safeTxHash,
            status: ProposalStatus.PROPOSED,
            description: `Unwrap ${amountWeth} WETH → ETH`,
            to: this.uniswapService.getWETHAddress(),
            value: '0',
            data: unwrapCalldata,
            createdAt: new Date().toISOString(),
        };
        this.stateManager.addProposal(proposal);

        return {
            safeTxHash,
            summary: `Proposed: Unwrap ${amountWeth} WETH → ETH`,
            instructions: `Unwrap WETH transaction proposed!\n\nSafeTxHash: ${safeTxHash}\n\nThis will convert ${amountWeth} WETH back to ${amountWeth} ETH.\n\nNext steps:\n1. Open Safe UI (app.safe.global)\n2. Go to Transactions → Queue\n3. Find and confirm the pending unwrap transaction\n4. Run execute_if_ready('${safeTxHash}') once confirmed`,
        };
    }

    // ============================================
    // Aave V3 Operations
    // ============================================

    /**
     * Propose depositing (supplying) tokens to Aave V3
     * Batches: approve + supply
     */
    async proposeAaveDeposit(token: string, amount: string): Promise<ProposeResult> {
        await this.init();

        const tokenInfo = await this.aaveService.resolveToken(token);
        const amountRaw = await this.aaveService.parseAmount(amount, token);

        // Build approve calldata
        const approveCalldata = this.aaveService.buildApproveCalldata(
            this.aaveService.getPoolAddress(),
            amountRaw
        );

        // Build supply calldata
        const supplyCalldata = this.aaveService.buildSupplyCalldata(
            tokenInfo.address,
            amountRaw,
            this.safeAddress
        );

        // Batch: 1) approve + 2) supply
        const safeTx = await this.safeService.buildBatchTx([
            {
                to: tokenInfo.address,
                value: 0n,
                data: approveCalldata,
            },
            {
                to: this.aaveService.getPoolAddress(),
                value: 0n,
                data: supplyCalldata,
            },
        ]);

        // Get hash and sign
        const safeTxHash = await this.safeService.getTransactionHash(safeTx);
        const signature = await this.safeService.signTransactionHash(safeTxHash);

        // Propose to transaction service
        await this.txServiceClient.proposeTransaction(
            this.safeAddress,
            safeTx.data,
            safeTxHash,
            this.agentAddress,
            signature.data
        );

        // Save proposal to state
        const proposal: Proposal = {
            safeTxHash,
            status: ProposalStatus.PROPOSED,
            description: `Aave Deposit: ${amount} ${tokenInfo.symbol}`,
            to: this.aaveService.getPoolAddress(),
            value: '0',
            data: supplyCalldata,
            createdAt: new Date().toISOString(),
        };
        this.stateManager.addProposal(proposal);

        return {
            safeTxHash,
            summary: `Proposed: Deposit ${amount} ${tokenInfo.symbol} to Aave (includes approval)`,
            instructions: `Aave deposit proposed!\n\nSafeTxHash: ${safeTxHash}\n\nThis will deposit ${amount} ${tokenInfo.symbol} to Aave V3.\nYou will receive a${tokenInfo.symbol} tokens representing your deposit.\n\nNext steps:\n1. Open Safe UI (app.safe.global)\n2. Go to Transactions → Queue\n3. Find and confirm the pending deposit transaction\n4. Run execute_if_ready('${safeTxHash}') once confirmed`,
        };
    }

    /**
     * Propose withdrawing tokens from Aave V3
     * Use 'max' as amount to withdraw all (including earned interest)
     */
    async proposeAaveWithdraw(token: string, amount: string): Promise<ProposeResult> {
        await this.init();

        const tokenInfo = await this.aaveService.resolveToken(token);
        const isMax = amount.toLowerCase() === 'max';
        const amountRaw = isMax ? this.aaveService.getMaxUint256() : await this.aaveService.parseAmount(amount, token);

        // Build withdraw calldata
        const withdrawCalldata = this.aaveService.buildWithdrawCalldata(
            tokenInfo.address,
            amountRaw,
            this.safeAddress
        );

        // Build Safe transaction
        const safeTx = await this.safeService.buildRawTx(
            this.aaveService.getPoolAddress(),
            0n,
            withdrawCalldata
        );

        // Get hash and sign
        const safeTxHash = await this.safeService.getTransactionHash(safeTx);
        const signature = await this.safeService.signTransactionHash(safeTxHash);

        // Propose to transaction service
        await this.txServiceClient.proposeTransaction(
            this.safeAddress,
            safeTx.data,
            safeTxHash,
            this.agentAddress,
            signature.data
        );

        // Save proposal to state
        const amountDisplay = isMax ? 'all' : amount;
        const proposal: Proposal = {
            safeTxHash,
            status: ProposalStatus.PROPOSED,
            description: `Aave Withdraw: ${amountDisplay} ${tokenInfo.symbol}`,
            to: this.aaveService.getPoolAddress(),
            value: '0',
            data: withdrawCalldata,
            createdAt: new Date().toISOString(),
        };
        this.stateManager.addProposal(proposal);

        return {
            safeTxHash,
            summary: `Proposed: Withdraw ${amountDisplay} ${tokenInfo.symbol} from Aave`,
            instructions: `Aave withdraw proposed!\n\nSafeTxHash: ${safeTxHash}\n\nThis will withdraw ${amountDisplay} ${tokenInfo.symbol} from Aave V3${isMax ? ' (including earned interest)' : ''}.\n\nNext steps:\n1. Open Safe UI (app.safe.global)\n2. Go to Transactions → Queue\n3. Find and confirm the pending withdraw transaction\n4. Run execute_if_ready('${safeTxHash}') once confirmed`,
        };
    }

    /**
     * Request tokens from the Aave Faucet
     * This is an EOA transaction from the agent (not a Safe proposal)
     */
    async requestAaveFaucet(token: string, amount: string): Promise<{ hash: Hex; message: string }> {
        const tokenInfo = await this.aaveService.resolveToken(token);
        const amountRaw = await this.aaveService.parseAmount(amount, token);

        // Build faucet mint calldata
        const data = this.aaveService.buildFaucetMintCalldata(
            tokenInfo.address,
            this.safeAddress, // Mint directly to Safe for convenience
            amountRaw
        );

        // Send transaction from agent EOA
        const safeProvider = this.safeService.getProtocolKit()?.getSafeProvider();
        if (!safeProvider) {
            throw new Error('Safe provider not initialized');
        }

        const signer = await safeProvider.getExternalSigner();
        if (!signer) {
            throw new Error('Signer not found');
        }

        const customChain = defineChain({
            id: Number(this.config.chainId),
            name: this.config.name,
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: {
                default: { http: [this.config.rpcUrl] },
            },
        });

        const hash = await signer.sendTransaction({
            to: this.aaveService.getFaucetAddress(),
            value: 0n,
            data,
            chain: customChain,
        });

        return {
            hash,
            message: `✓ Requested ${amount} ${tokenInfo.symbol} from Aave Faucet.\n\nTransaction Hash: ${hash}\nTokens are being minted directly to the Safe: ${this.safeAddress}`,
        };
    }

    /**
     * Get a yield opportunity summary from DefiLlama for supported tokens
     */
    async getYieldSummary(): Promise<string> {
        if (!this.config.llamaChainName) {
            return "Yield data lookup not configured for this chain.";
        }

        const mergedTokens = this.stateManager.getTokens(this.config.chainId, this.config.tokens);
        const symbols = mergedTokens.map(t => t.symbol);

        return this.yieldService.getYieldSummary(this.config.llamaChainName, symbols);
    }
}
