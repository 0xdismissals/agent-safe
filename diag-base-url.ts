import SafeApiKit from '@safe-global/api-kit';

const chainId = 8453n;
const ApiKit = (SafeApiKit as any).default || SafeApiKit;
const apiKit = new ApiKit({
    chainId,
});

console.log('Chain ID:', chainId.toString());
console.log('SDK Internals check:');
try {
    const apiKitAny = apiKit as any;
    // Check various internal properties where the URL might be stored
    console.log('txServiceUrl:', apiKitAny.txServiceUrl);
    console.log('txServiceBaseUrl:', apiKitAny.txServiceBaseUrl);
    console.log('safeConfigService:', apiKitAny.safeConfigService);
} catch (e) {
    console.error('Error accessing internals:', e);
}
