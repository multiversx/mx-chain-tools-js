const fs = require("fs");
const path = require("path");
const child_process = require("child_process");
const minimist = require("minimist");
const { asUserPath, readJsonFile, writeJsonFile } = require("./filesystem");
const { Config } = require("./config");
const { NetworkProvider } = require("./networkProvider");

const SHARDS = [0, 1, 2];

async function main() {
    const argv = minimist(process.argv.slice(2));
    const workspace = asUserPath(argv.workspace);
    const round = parseInt(argv.round);
    const gatewayUrl = argv.gateway;
    const configFile = argv.config;

    if (!workspace) {
        fail("Missing parameter 'workspace'! E.g. --workspace=~/myworkspace");
    }
    if (!round) {
        fail("Missing parameter 'round'! E.g. --round=42");
    }
    if (!gatewayUrl) {
        fail("Missing parameter 'gateway'! E.g. --gateway=https://gateway.multiversx.com");
    }
    if (!configFile) {
        fail("Missing parameter 'config'! E.g. --config=config.json");
    }

    console.log("Workspace:", workspace);
    console.log("Round:", round);
    console.log("Gateway URL:", gatewayUrl);

    const config = Config.load(configFile);
    const networkProvider = new NetworkProvider(gatewayUrl);

    const blockInfoByShard = await networkProvider.getBlockInfoInRoundByShard(round);
    const epoch = blockInfoByShard[0].epoch;
    const epochBefore = epoch - 1;

    console.log(`Epoch: ${epoch}, epoch before: ${epochBefore}`);

    console.log("blockInfoByShard", blockInfoByShard);

    // Extract blockchain state from the deep-history archives.
    for (const shard of SHARDS) {
        const dbDir = path.join(workspace, `shard-${shard}`, "db-for-exporter");

        fs.rmSync(dbDir, { recursive: true, force: true });
        fs.mkdirSync(path.join(dbDir, "1"), { recursive: true });
        fs.mkdirSync(path.join(dbDir, "0"), { recursive: true });

        const epochArchive = path.join(workspace, `shard-${shard}`, `Epoch_${epoch}.tar`);
        const epochBeforeArchive = path.join(workspace, `shard-${shard}`, `Epoch_${epochBefore}.tar`);

        extractTrie(path.join(dbDir, "1"), epochArchive, epoch, shard);
        extractTrie(path.join(dbDir, "0"), epochBeforeArchive, epochBefore, shard);
    }

    const allAccounts = [];

    for (const shard of SHARDS) {
        const dbDir = path.join(workspace, `shard-${shard}`, "db-for-exporter");
        const usersOutfile = path.join(workspace, `users_${shard}.json`);
        const contractsOutfile = path.join(workspace, `contracts_${shard}.json`);

        exportTokens({
            dbDir: dbDir,
            rootHash: blockInfoByShard[shard].rootHash,
            tokensSymbols: config.tokens,
            usersOutfile,
            contractsOutfile,
        });

        allAccounts.push(...(readJsonFile(usersOutfile).accounts));
        allAccounts.push(...(readJsonFile(contractsOutfile).accounts));
    }

    allAccounts.sort((a, b) => {
        if (a.address < b.address) {
            return -1;
        }
        if (a.address > b.address) {
            return 1;
        }
        return 0;
    });

    const allAccountsOutput = allAccounts.map(item => {
        const holder = item.address;
        const holderTag = config.getTagOfAddress(holder);
        const tokens = item.tokens.map(token => { return { holder, holderTag, ...token } });

        return {
            address: holder,
            addressTag: holderTag,
            tokens: tokens
        }
    });

    // Save concatenated accounts.
    writeJsonFile(path.join(workspace, "accounts.json"), allAccountsOutput);

    const contracts = []
        .concat(config.pools)
        .concat(config.farms)
        .concat(config.metastakingFarms);

    for (const contract of contracts) {
        // TODO: Fix hardcoded shard = 1 (DEX contracts are in shard 1).
        const dbDir = path.join(workspace, `shard-1`, "db-for-exporter");
        const outfile = path.join(workspace, contract.stateFilename);

        exportAccountState({
            dbDir: dbDir,
            address: contract.address,
            rootHash: blockInfoByShard[1].rootHash,
            outfile: outfile
        });
    }
}

function extractTrie(destinationDir, archive, epoch, shard) {
    console.info(`Extracting trie for epoch = ${epoch}, shard = ${shard} to ${destinationDir}...`);

    try {
        child_process.execSync(`tar -C ${destinationDir} -xf ${archive} Epoch_${epoch}/Shard_${shard}/AccountsTrie --strip-components=3`);
    } catch (error) {
        fail(`Failed to extract trie: ${error}`);
    }
}

// Exports tokens of users and contracts, using the "tokensExporter" tool.
function exportTokens({ dbDir, rootHash, tokensSymbols, usersOutfile, contractsOutfile }) {
    const tokensFlags = tokensSymbols.map(symbol => `--tokens=${symbol}`).join(" ");

    try {
        const commandForUsers = `tokensExporter --db-directory=${dbDir} --hex-roothash=${rootHash} --outfile=${usersOutfile} ${tokensFlags} --log-level *:WARN`;
        console.info("Running command:", commandForUsers);
        child_process.execSync(commandForUsers, { stdio: "inherit" });

        const commandForContracts = `tokensExporter --db-directory=${dbDir} --hex-roothash=${rootHash} --outfile=${contractsOutfile} ${tokensFlags} --contracts --log-level *:WARN`;
        console.info("Running command:", commandForContracts);
        child_process.execSync(commandForContracts, { stdio: "inherit" });
    } catch (error) {
        fail(`Failed to export tokens: ${error}`);
    }
}

// Exports state of an account (contract), using the "accountStorageExporter" tool.
function exportAccountState({ dbDir, address, rootHash, outfile }) {
    try {
        const command = `accountStorageExporter --address ${address} --db-directory=${dbDir} --hex-roothash=${rootHash} --outfile=${outfile} --log-level *:WARN`;
        console.info(`Running command:`, command);
        child_process.execSync(command, { stdio: "inherit" });
        console.info(`Exported state to ${outfile}.`);
    } catch (error) {
        fail(`Failed to export state: ${error}`);
    }
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

