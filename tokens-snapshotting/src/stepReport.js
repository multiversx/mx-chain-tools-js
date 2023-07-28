const path = require("path");
const { formatAmount } = require("./utils");
const { readJsonFile, asUserPath, writeTextFile, writeJsonFile } = require("./filesystem");
const { default: BigNumber } = require("bignumber.js");
const minimist = require("minimist");

async function main(args) {
    const parsedArgs = minimist(args);
    const workspace = asUserPath(parsedArgs.workspace);
    const outfile = asUserPath(parsedArgs.outfile);
    const configFile = parsedArgs.config;

    if (!workspace) {
        fail("Missing parameter 'workspace'! E.g. --workspace=~/myworkspace");
    }
    if (!outfile) {
        fail("Missing parameter 'outfile'! E.g. --outfile=~/report.txt");
    }
    if (!configFile) {
        fail("Missing parameter 'config'! E.g. --config=config.json");
    }

    const config = readJsonFile(configFile);
    const report = {
        users: gatherUsers(workspace),
        unknownContracts: gatherUnknownContracts(workspace, config)
    }

    writeJsonFile(outfile, report);

    let totalBaseToken = new BigNumber(0);

    for (const user of report.users) {
        totalBaseToken = totalBaseToken.plus(user.total);
    }

    for (const contract of report.unknownContracts) {
        for (const token of contract.tokens) {
            const metadata = config.tokensMetadata[token.name];

            if (metadata.isBaseToken) {
                totalBaseToken = totalBaseToken.plus(token.balance);
            }
        }
    }

    console.log("Total base token:", totalBaseToken.toFixed(0));
    console.log("Total base token (formatted):", formatAmount(totalBaseToken, 18));
}

function gatherUsers(workspace) {
    const inputPath = path.join(workspace, `users_with_unwrapped_tokens.json`);
    const usersData = readJsonFile(inputPath);
    const users = [];

    for (const user of usersData) {
        const total = computeTotalForUser(user);

        users.push({
            address: user.address,
            total: total
        });
    }

    users.sort((a, b) => {
        return b.total.comparedTo(a.total);
    });

    const records = users.map((record, index) => {
        return {
            rank: index,
            address: record.address,
            total: record.total.toFixed(0),
            totalFormatted: formatAmount(record.total, 18)
        };
    });

    return records;
}

function computeTotalForUser(user) {
    let total = new BigNumber(0);

    for (const token of user.tokens) {
        const recovered = new BigNumber(token.unwrapped.recovered || 0);
        const rewards = new BigNumber(token.unwrapped.rewards || 0);
        total = total.plus(recovered);
        total = total.plus(rewards);
    }

    return total;
}

function gatherUnknownContracts(workspace, config) {
    const inputPath = path.join(workspace, `contracts.json`);
    const contractsData = readJsonFile(inputPath);
    const knownContracts = [].concat(config.pools, config.farms, config.metastakingFarms, config.hatomMoneyMarkets);
    const knownAddresses = knownContracts.map(item => item.address);

    const unknownContracts = contractsData.filter(item => !knownAddresses.includes(item.address));
    const records = [];

    for (const item of unknownContracts) {
        const tokens = item.tokens.map(token => {
            return {
                name: token.name,
                balance: token.balance,
                balanceFormatted: formatAmount(token.balance, 18)
            };
        });

        records.push({
            address: item.address,
            tokens: tokens
        });
    }

    return records;
}

(async () => {
    if (require.main === module) {
        await main(process.argv.slice(2));
    }
})();

module.exports = {
    main,
    computeTotalForUser
};
