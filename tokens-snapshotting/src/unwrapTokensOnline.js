const { NetworkProvider } = require("./networkProvider");
const { readJsonFile, writeJsonFile, NetworkContractStateProvider } = require("./utils");
const { createFarmsSummary, createMetastakingSummary, createPoolsSummary, decodeTokensAttributes } = require("./step_decode_state");
const { unwrapTokens } = require("./step_unwrap_tokens");
const { computeTotalForUser } = require("./step_report");
const { BunchOfAccounts, FarmsSummary, PoolsSummary, formatAmount } = require("./utils.js");
const diskcache = require("./diskcache");
const minimist = require("minimist");

const ROUNDS_DELTA = 3;

async function main() {
    const argv = minimist(process.argv.slice(2));
    const providedRound = parseInt(argv.round);
    const gatewayUrl = argv.gateway;
    const address = args.address;

    if (!gatewayUrl) {
        fail("Missing parameter 'gateway'! E.g. --gateway=https://gateway.multiversx.com");
    }
    if (!address) {
        fail("Missing parameter 'address'! E.g. --address=erd1qyu5wthldzr8wx5c9ucg8kjagg0jfs53s8nr3zpz3hypefsdd8ssycr6th");
    }

    console.log("Round:", round);
    console.log("Gateway URL:", gatewayUrl);

    const config = readJsonFile("config.json");
    const networkProvider = new NetworkProvider(gatewayUrl);
    const round = await decideRound(networkProvider, providedRound);
    console.log("Round:", round);

    const blockInfoByShard = await networkProvider.getBlockInfoInRoundByShard(networkProvider, round);

    const contractStateProvider = new NetworkContractStateProvider(networkProvider, blockInfoByShard);

    const contracts = [].concat(config.pools).concat(config.farms).concat(config.metastakingFarms);

    for (const contract of contracts) {
        contract.tokens = await getAccountTokens(contract.address, { networkProvider, config, blockInfoByShard });
    }

    const userTokens = await getAccountTokens(address, { networkProvider, config, blockInfoByShard });
    const account = { address: address, tokens: userTokens };

    decodeTokensAttributes(contracts);
    decodeTokensAttributes([account]);

    const context = {
        contracts: new BunchOfAccounts(contracts),
        farmsSummary: new FarmsSummary({
            farms: await createFarmsSummary(contractStateProvider, config),
            metastakingFarms: await createMetastakingSummary(contractStateProvider, config)
        }),
        poolsSummary: new PoolsSummary(await createPoolsSummary(contractStateProvider, config))
    };

    await unwrapTokens(context, userTokens);
    writeJsonFile(`online_unwrapped_${address}.json`, userTokens);

    console.log("=".repeat(80));
    console.log("Summary:");
    console.log("=".repeat(80));

    for (const token of userTokens) {
        console.log(JSON.stringify(token, null, 4));

        console.log(token.name, formatAmount(token.balance, 18));

        const unwrapped = token.unwrapped;

        if (unwrapped.recovered) {
            console.log("... recovered:", formatAmount(unwrapped.recovered, 18));
        }

        if (unwrapped.rewards) {
            console.log("... rewards:", formatAmount(unwrapped.rewards, 18));
        }
    }

    const total = computeTotalForUser(account);

    console.log("=".repeat(80));
    console.log("Total:", formatAmount(total, 18));
}

async function decideRound(networkProvider, providedRound) {
    if (providedRound) {
        return providedRound;
    }

    const networkStatus = await networkProvider.getNetworkStatus();
    return networkStatus.CurrentRound - ROUNDS_DELTA;
}

async function getAccountTokens(address, { networkProvider, config, blockInfoByShard }) {
    const shardData = await networkProvider.doGetGeneric(`address/${address}/shard`)
    const shard = shardData.shardID;
    const blockInfo = blockInfoByShard[shard];
    const blockNonce = blockInfo.nonce;
    const cacheKey = `account-tokens-${address}-${blockNonce}`;

    const cachedTokens = await diskcache.get(cacheKey);
    if (cachedTokens) {
        console.log("getAccountTokens() - cache hit", address);
        return cachedTokens;
    }

    console.log("getAccountTokens() - cache miss", address);

    const esdtData = await networkProvider.doGetGeneric(`address/${address}/esdt?blockNonce=${blockNonce}`);
    const allTokens = esdtData.esdts;
    const filteredTokens = [];

    for (const [key, value] of Object.entries(allTokens)) {
        const tokenName = extractTokenNameFromTokenIdentifier(key);

        if (!config.tokens.includes(tokenName)) {
            continue;
        }

        filteredTokens.push({
            name: tokenName,
            ...value,
        });
    }

    await diskcache.put(cacheKey, filteredTokens);

    return filteredTokens;
}

function extractTokenNameFromTokenIdentifier(tokenIdentifier) {
    const parts = tokenIdentifier.split("-");
    return `${parts[0]}-${parts[1]}`;
}

(async () => {
    if (require.main === module) {
        await main();
    }
})();
