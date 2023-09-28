const path = require("path");
const { formatAmount, BunchOfAccounts } = require("./utils");
const { readJsonFile, asUserPath, writeTextFile, writeJsonFile } = require("./filesystem");
const { default: BigNumber } = require("bignumber.js");
const minimist = require("minimist");
const { Config } = require("./config");

async function main(args) {
    const parsedArgs = minimist(args);
    const workspace = asUserPath(parsedArgs.workspace);
    const tag = parsedArgs.tag;
    const rankingOutfile = asUserPath(`${tag}-ranking.json`);
    const configFile = parsedArgs.config;

    if (!workspace) {
        fail("Missing parameter 'workspace'! E.g. --workspace=~/myworkspace");
    }
    if (!tag) {
        fail("Missing parameter 'tag'! E.g. --outfile=~/report.txt");
    }
    if (!configFile) {
        fail("Missing parameter 'config'! E.g. --config=config.json");
    }

    const config = Config.load(configFile);

    const accountsData = readJsonFile(path.join(workspace, `accounts_with_unwrapped_tokens.json`));
    const accounts = new BunchOfAccounts(accountsData);

    const rankedAccountsRecords = rankAccounts(config, accounts);

    writeJsonFile(rankingOutfile, {
        accounts: rankedAccountsRecords
    });

    let totalBaseToken = new BigNumber(0);

    for (const account of rankedAccountsRecords) {
        totalBaseToken = totalBaseToken.plus(account.balance);
    }

    console.log("Total base token:", totalBaseToken.toFixed(0));
    console.log("Total base token (formatted):", formatAmount(totalBaseToken, 18));
}

function rankAccounts(config, bunchOfAccounts) {
    const rankedAccounts = [];

    for (const account of bunchOfAccounts.getAllAccounts()) {
        if (account.address == config.metabondingContractAddress) {
            continue;
        }

        const total = computeTotalForAccount(account);

        if (total.isZero()) {
            console.log("Skipping account", account.address, "because total is zero");
            continue;
        }

        rankedAccounts.push({
            ...account,
            total: total
        });
    }

    rankedAccounts.sort((a, b) => {
        return b.total.comparedTo(a.total);
    });

    const records = rankedAccounts.map((record, index) => {
        return {
            rank: index,
            address: record.address,
            ...{ addressTag: record.addressTag },
            balance: record.total.toFixed(0),
            balanceFormatted: formatAmount(record.total, 18)
        };
    });

    return records;
}

function computeTotalForAccount(account) {
    let total = new BigNumber(0);

    for (const token of account.tokens) {
        const recovered = new BigNumber(token.unwrapped?.recovered || 0);
        const rewards = new BigNumber(token.unwrapped?.rewards || 0);
        total = total.plus(recovered);
        total = total.plus(rewards);
    }

    return total;
}

function fail(message) {
    console.error(message);
    process.exit(1);
}

(async () => {
    if (require.main === module) {
        await main(process.argv.slice(2));
    }
})();

module.exports = {
    main,
    computeTotalForAccount: computeTotalForAccount
};
