const path = require("path");
const { formatAmount } = require("./utils");
const { readJsonFile, asUserPath, writeTextFile } = require("./filesystem");
const { default: BigNumber } = require("bignumber.js");
const minimist = require("minimist");

async function main(args) {
    const parsedArgs = minimist(args);
    const workspace = asUserPath(parsedArgs.workspace);
    const outfile = asUserPath(parsedArgs.outfile);

    if (!workspace) {
        fail("Missing parameter 'workspace'! E.g. --workspace=~/myworkspace");
    }
    if (!outfile) {
        fail("Missing parameter 'outfile'! E.g. --outfile=~/report.txt");
    }

    const inputPath = path.join(workspace, `users_with_unwrapped_tokens.json`);
    const usersData = readJsonFile(inputPath);
    const records = [];

    for (const user of usersData) {
        const total = computeTotalForUser(user);

        records.push({
            address: user.address,
            total: total
        });
    }

    records.sort((a, b) => {
        return b.total.comparedTo(a.total);
    });

    const lines = [];

    for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const line = `${i} ${record.address} ${formatAmount(record.total, 18)}`;

        lines.push(line);
    }

    writeTextFile(outfile, lines);
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

(async () => {
    if (require.main === module) {
        await main(process.argv.slice(2));
    }
})();

module.exports = {
    main,
    computeTotalForUser
};
