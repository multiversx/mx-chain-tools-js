const path = require("path");
const { formatAmount } = require("./utils");
const { readJsonFile, asUserPath, writeTextFile, writeJsonFile } = require("./filesystem");
const { default: BigNumber } = require("bignumber.js");
const minimist = require("minimist");
const { Config } = require("./config");

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

    const config = Config.load(configFile);
    const report = {
        users: gatherAccounts(workspace)
    }

    writeJsonFile(outfile, report);

    let totalBaseToken = new BigNumber(0);

    for (const user of report.users) {
        totalBaseToken = totalBaseToken.plus(user.total);
    }

    console.log("Total base token:", totalBaseToken.toFixed(0));
    console.log("Total base token (formatted):", formatAmount(totalBaseToken, 18));
}

function gatherAccounts(workspace) {
    const inputPath = path.join(workspace, `accounts_with_unwrapped_tokens.json`);
    const accountsData = readJsonFile(inputPath);
    const accounts = [];

    for (const account of accountsData) {
        const total = computeTotalForAccount(account);

        accounts.push({
            address: account.address,
            ...{ addressTag: account.addressTag },
            total: total
        });
    }

    accounts.sort((a, b) => {
        return b.total.comparedTo(a.total);
    });

    const records = accounts.map((record, index) => {
        return {
            rank: index,
            address: record.address,
            ...{ addressTag: record.addressTag },
            total: record.total.toFixed(0),
            totalFormatted: formatAmount(record.total, 18)
        };
    });

    return records;
}

function computeTotalForAccount(user) {
    let total = new BigNumber(0);

    for (const token of user.tokens) {
        const recovered = new BigNumber(token.unwrapped?.recovered || 0);
        const rewards = new BigNumber(token.unwrapped?.rewards || 0);
        total = total.plus(recovered);
        total = total.plus(rewards);
    }

    return total;
}

(async () => {
    if (require.main === module) {
        await main(process.argv.slice(2));
    }
})();

module.exports = {
    main,
    computeTotalForUser: computeTotalForAccount
};
