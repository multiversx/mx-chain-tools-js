const fs = require("fs");
const path = require("path");
const minimist = require("minimist");
const { asUserPath, readJsonFile, writeJsonFile } = require("./filesystem");
const { FilesystemContractStateProvider } = require("./contractStateProviders");
const { bufferToBigInt } = require("@multiversx/sdk-core/out/smartcontracts/codec/utils");
const { BinaryCodec } = require("@multiversx/sdk-core/out/smartcontracts");
const { StringValue } = require("@multiversx/sdk-core/out/smartcontracts");
const { Address } = require("@multiversx/sdk-core");
const dex = require("@multiversx/sdk-exchange");
const { default: BigNumber } = require("bignumber.js");

const STAKING_UNBOND_ATTRIBUTES_LEN = 12;
const codec = new BinaryCodec();

async function main(args) {
    const parsedArgs = minimist(args);
    const workspace = asUserPath(parsedArgs.workspace);
    const configFile = parsedArgs.config;

    if (!workspace) {
        fail("Missing parameter 'workspace'! E.g. --workspace=~/myworkspace");
    }
    if (!configFile) {
        fail("Missing parameter 'config'! E.g. --config=config.json");
    }

    console.log("Workspace:", workspace);
    console.log("Config file:", configFile);

    const config = readJsonFile(configFile);
    const contractStateProvider = new FilesystemContractStateProvider(workspace);

    writeJsonFile(
        path.join(workspace, `contracts_summary.json`),
        {
            farms: await createFarmsSummary(contractStateProvider, config),
            metastakingFarms: await createMetastakingSummary(contractStateProvider, config),
            pools: await createPoolsSummary(contractStateProvider, config),
            hatomMoneyMarkets: await createHatomMoneyMarketsSummary(contractStateProvider, config)
        }
    );

    decodeAttributesInFile(
        path.join(workspace, `accounts.json`),
        path.join(workspace, `accounts_with_decoded_attributes.json`),
        config.tokensMetadata
    );
}

async function createFarmsSummary(contractStateProvider, config) {
    const result = {};

    for (const item of config.farms) {
        const state = await contractStateProvider.getState(item);

        const rewardPerShareBytes = Buffer.from(state[Buffer.from("reward_per_share").toString("hex")], "hex");
        const rewardPerShare = bufferToBigInt(rewardPerShareBytes);

        const divisionSafetyNumberBytes = Buffer.from(state[Buffer.from("division_safety_constant").toString("hex")] || "", "hex");
        const divisionSafetyNumber = bufferToBigInt(divisionSafetyNumberBytes);

        const accumulatedRewardsBytes = Buffer.from(state[Buffer.from("accumulatedRewards").toString("hex")] || "", "hex");
        const accumulatedRewards = bufferToBigInt(accumulatedRewardsBytes);

        const farmTokenSupplyBytes = Buffer.from(state[Buffer.from("farm_token_supply").toString("hex")] || "", "hex");
        const farmTokenSupply = bufferToBigInt(farmTokenSupplyBytes);

        const rewardCapacityBytes = Buffer.from(state[Buffer.from("reward_capacity").toString("hex")] || "", "hex");
        const rewardCapacity = bufferToBigInt(rewardCapacityBytes);

        const rewardReserveBytes = Buffer.from(state[Buffer.from("reward_reserve").toString("hex")] || "", "hex");
        const rewardReserve = bufferToBigInt(rewardReserveBytes);

        const rewardTokenId = getString(state, "reward_token_id");
        const farmTokenId = getString(state, "farm_token_id");
        const farmingTokenId = getString(state, "farming_token_id");

        const rewardTokenBalance = getESDTBalance(state, rewardTokenId);
        const farmingTokenBalance = getESDTBalance(state, farmingTokenId);

        result[item.token] = {
            name: item.token,
            contractAddress: item.address,
            rewardPerShare: rewardPerShare.toFixed(),
            rewardTokenId: rewardTokenId,
            farmTokenId: farmTokenId,
            farmingTokenId: farmingTokenId,
            divisionSafetyNumber: divisionSafetyNumber,
            accumulatedRewards: accumulatedRewards.toFixed(),
            farmTokenSupply: farmTokenSupply.toFixed(),
            rewardCapacity: rewardCapacity.toFixed(),
            rewardReserve: rewardReserve.toFixed(),
            rewardTokenBalance: rewardTokenBalance.toFixed(),
            farmingTokenBalance: farmingTokenBalance.toFixed()
        };
    }

    return result;
}

async function createMetastakingSummary(contractStateProvider, config) {
    const result = {};

    for (const item of config.metastakingFarms) {
        const state = await contractStateProvider.getState(item);

        const summary = {
            contractAddress: item.address,
            dualYieldTokenId: Buffer.from(state[Buffer.from("dualYieldTokenId").toString("hex")], "hex").toString(),
            farmTokenId: Buffer.from(state[Buffer.from("farmTokenId").toString("hex")], "hex").toString(),
            lpFarmAddress: Address.fromBuffer(Buffer.from(state[Buffer.from("lpFarmAddress").toString("hex")], "hex")).bech32(),
            lpFarmTokenId: Buffer.from(state[Buffer.from("lpFarmTokenId").toString("hex")], "hex").toString(),
            lpTokenId: Buffer.from(state[Buffer.from("lpTokenId").toString("hex")], "hex").toString(),
            pairAddress: Address.fromBuffer(Buffer.from(state[Buffer.from("pairAddress").toString("hex")], "hex")).bech32(),
            stakingFarmAddress: Address.fromBuffer(Buffer.from(state[Buffer.from("stakingFarmAddress").toString("hex")], "hex")).bech32(),
            stakingTokenId: Buffer.from(state[Buffer.from("stakingTokenId").toString("hex")], "hex").toString()
        };

        result[item.token] = summary;
    }

    return result;
}

async function createPoolsSummary(contractStateProvider, config) {
    const result = {};

    for (const item of config.pools) {
        const state = await contractStateProvider.getState(item);

        const firstTokenId = getString(state, "first_token_id");
        const secondTokenId = getString(state, "second_token_id");

        const firstTokenBalance = getESDTBalance(state, firstTokenId);
        const secondTokenBalance = getESDTBalance(state, secondTokenId);

        const lpTokenSupply = getBigInt(state, "lp_token_supply");
        const reserveFirstToken = getBigInt(state, Buffer.concat([Buffer.from("reserve"), codec.encodeNested(new StringValue(firstTokenId))]));
        const reserveSecondToken = getBigInt(state, Buffer.concat([Buffer.from("reserve"), codec.encodeNested(new StringValue(secondTokenId))]));

        result[item.token] = {
            contractAddress: item.address,
            firstTokenId: firstTokenId,
            secondTokenId: secondTokenId,
            firstTokenBalance: firstTokenBalance.toFixed(),
            secondTokenBalance: secondTokenBalance.toFixed(),
            lpTokenSupply: lpTokenSupply.toFixed(),
            reserveFirstToken: reserveFirstToken.toFixed(),
            reserveSecondToken: reserveSecondToken.toFixed()
        }
    }

    return result;
}

async function createHatomMoneyMarketsSummary(contractStateProvider, config) {
    const result = {};

    for (const item of config.hatomMoneyMarkets) {
        const state = await contractStateProvider.getState(item);

        const totalSupply = bufferToBigInt(Buffer.from(state[Buffer.from("total_supply").toString("hex")], "hex"));
        const cash = bufferToBigInt(Buffer.from(state[Buffer.from("cash").toString("hex")], "hex"));
        const totalBorrows = bufferToBigInt(Buffer.from(state[Buffer.from("total_borrows").toString("hex")], "hex"));
        const totalReserves = bufferToBigInt(Buffer.from(state[Buffer.from("total_reserves").toString("hex")], "hex"));
        const wad = new BigNumber("1000000000000000000");

        const liquidity = cash.plus(totalBorrows).minus(totalReserves);
        const exchangeRate = liquidity.dividedBy(totalSupply).times(wad);

        result[item.token] = {
            contractAddress: item.address,
            totalSupply: totalSupply.toFixed(),
            cash: cash.toFixed(),
            totalBorrows: totalBorrows.toFixed(),
            totalReserves: totalReserves.toFixed(),
            liquidity: liquidity.toFixed(),
            exchangeRate: exchangeRate.toFixed(),
            wad: wad.toFixed()
        };
    }

    return result;
}

function getString(state, key) {
    const encodedKey = Buffer.from(key).toString("hex");
    const encodedValue = state[encodedKey];
    const value = Buffer.from(encodedValue, "hex");
    return value.toString();
}

function getESDTBalance(state, tokenId) {
    const encodedKey = Buffer.from(`ELRONDesdt${tokenId}`).toString("hex");
    const encodedValue = state[encodedKey] || "";
    const value = Buffer.from(encodedValue, "hex").subarray(2);
    return bufferToBigInt(value);
}

function getBigInt(state, key, defaultValue) {
    const encodedKey = Buffer.from(key).toString("hex");
    const encodedValue = state[encodedKey];

    if (encodedValue === undefined) {
        if (defaultValue !== undefined) {
            return defaultValue;
        }

        throw new Error(`cannot find key: [${key}]`);
    }

    const value = Buffer.from(encodedValue, "hex");
    return bufferToBigInt(value);
}

function decodeAttributesInFile(inputFile, outputFile, tokensMetadata) {
    console.log("decodeAttributesInFile()", inputFile);

    const json = fs.readFileSync(inputFile, { encoding: "utf8" });
    const accounts = JSON.parse(json);
    decodeTokensAttributes(accounts, tokensMetadata);

    writeJsonFile(outputFile, accounts);
}

function decodeTokensAttributes(accounts, tokensMetadata) {
    for (const account of accounts) {
        for (const token of account.tokens) {
            const metadata = tokensMetadata[token.name];

            // Fungible tokens do not have attributes.
            if (!token.nonce) {
                continue;
            }

            if (metadata.isFarmTokenV2) {
                token.decodedAttributes = dex.FarmTokenAttributesV2.fromAttributes(token.attributes);
                continue;
            }

            if (metadata.isFarmTokenV1_3) {
                token.decodedAttributes = dex.FarmTokenAttributesV1_3.fromAttributes(token.attributes);
                continue;
            }

            if (metadata.isStakingToken) {
                if (token.attributes.length == STAKING_UNBOND_ATTRIBUTES_LEN) {
                    token.decodedAttributes = dex.UnbondFarmTokenAttributes.fromAttributes(token.attributes);
                } else {
                    token.decodedAttributes = dex.StakingFarmTokenAttributes.fromAttributes(token.attributes);
                }

                continue;
            }

            if (metadata.isMetastakingToken) {
                token.decodedAttributes = dex.DualYieldTokenAttributes.fromAttributes(token.attributes);
                continue;
            }

            throw new Error(`unknown token: ${token.name}`);
        }
    }
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
    createFarmsSummary,
    createMetastakingSummary,
    createPoolsSummary,
    decodeTokensAttributes
};
