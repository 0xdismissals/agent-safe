import SafeApiKit from '@safe-global/api-kit';

const chainId = 8453n;
const ApiKit = (SafeApiKit as any).default || SafeApiKit;
const apiKit = new ApiKit({
    chainId,
});

console.log('Chain ID:', chainId.toString());

// Try to trigger a lazy initialization or find the config
(async () => {
    try {
        // This might fail but it might trigger URL resolution
        await apiKit.getSafeInfo('0x0000000000000000000000000000000000000000');
    } catch (e: any) {
        // Search for URL in the error message or stack trace
        console.log('Error caught:', e.message);
        if (e.config && e.config.url) {
            console.log('Resolved URL from axios config:', e.config.url);
        }
    }

    // Check internals again
    const apiKitAny = apiKit as any;
    console.log('Internals after call:');
    for (const key in apiKitAny) {
        if (typeof apiKitAny[key] === 'string' && apiKitAny[key].includes('http')) {
            console.log(`${key}: ${apiKitAny[key]}`);
        }
    }
})();
