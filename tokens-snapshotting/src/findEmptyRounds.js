const { NetworkProvider } = require("./networkProvider");
const { readJsonFile } = require("./filesystem");
const minimist = require("minimist");
const { SHARDS } = require("./constants");


async function main() {
    const argv = minimist(process.argv.slice(2));
    const gatewayUrl = argv.gateway;
    const startingRound = argv.round;
    const configFile = argv.config;

    if (!gatewayUrl) {
        fail("Missing parameter 'gateway'! E.g. --gateway=https://gateway.multiversx.com");
    }
    if (!startingRound) {
        fail("Missing parameter 'round'! E.g. --round=15678680");
    }
    if (!configFile) {
        fail("Missing parameter 'config'! E.g. --config=config.json");
    }

    const config = readJsonFile(configFile);
    const networkProvider = new NetworkProvider(gatewayUrl);
    const emptyRounds = [];

    for (let round = startingRound; true; round++) {
        const blockInfoByShard = await networkProvider.getBlockInfoInRoundByShard(round);

        const anyBlockMissing = SHARDS.some(shard => !blockInfoByShard[shard]);
        if (anyBlockMissing) {
            console.log(`Skipping round ${round} (missing blocks on some shards)!`);
            continue;
        }

        const getTransactionsPromises = SHARDS.map(shard => networkProvider.getTransactionsInBlock({
            shard,
            nonce: blockInfoByShard[shard].nonce
        }));

        const transactions = [].concat(...await Promise.all(getTransactionsPromises));

        const tokens = getTokensInvolvedInTransactions({
            transactions,
            tokens: config.tokens
        });

        if (tokens.length === 0) {
            emptyRounds.push(round);
            console.log(`✓ Round ${round} is free of token operations.`);
        } else {
            console.warn(`Round ${round} contains token operations!`, tokens.join(", "));
        }
    }
}

function getTokensInvolvedInTransactions({ transactions, tokens }) {
    const involvedTokens = [];

    for (const transaction of transactions || []) {
        const involvedTokensInTransaction = [];

        for (const token of transaction.tokens || []) {
            const tokenName = extractTokenNameFromTokenIdentifier(token);

            if (tokens.includes(tokenName)) {
                involvedTokens.push(tokenName);
                involvedTokensInTransaction.push(tokenName);
            }
        }

        if (involvedTokensInTransaction.length > 0) {
            console.log("tx", transaction.hash, "original", transaction.originalTransactionHash);

            if (transaction.originalTransactionHash) {
                console.log("\t", "originalTx", transaction.originalTransactionHash);
            }
        }
    }

    return involvedTokens;
}

function extractTokenNameFromTokenIdentifier(tokenIdentifier) {
    return tokenIdentifier.split("-")[0] + "-" + tokenIdentifier.split("-")[1];
}

function fail(message) {
    console.error(message);
    process.exit(1);
}

(async () => {
    if (require.main === module) {
        await main();
    }
})();
