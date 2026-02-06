import { type Address, type Hex } from 'viem';

export interface ISubService {
    // Common interface for services if needed
}

export interface ISwapService extends ISubService {
    getQuote(fromToken: string, toToken: string, amount: string): Promise<any>;
    buildSwapCalldata(params: any): Hex;
}

export interface ILendingService extends ISubService {
    buildSupplyCalldata(token: Address, amount: bigint, onBehalfOf: Address): Hex;
    buildWithdrawCalldata(token: Address, amount: bigint, to: Address): Hex;
}
