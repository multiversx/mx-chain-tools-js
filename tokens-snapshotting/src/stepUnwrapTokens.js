const path = require("path");
const { BigNumber } = require("bignumber.js");
const { asUserPath, readJsonFile, writeJsonFile } = require("./filesystem");
const { BunchOfAccounts, ContractsSummary, formatAmount } = require("./utils.js");
const minimist = require("minimist");
const { Config } = require("./config.js");
const { Checkpoints } = require("./checkpoints.js");

BigNumber.config({ DECIMAL_PLACES: 128 });

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

    const config = Config.load(configFile);

    const accountsData = readJsonFile(path.join(workspace, `accounts_with_decoded_attributes.json`))
    const accounts = new BunchOfAccounts(accountsData);
    const checkpoints = new Checkpoints();

    const contractsSummaryData = readJsonFile(path.join(workspace, `contracts_summary.json`));
    const contractsSummary = new ContractsSummary(contractsSummaryData);

    for (const account of accounts.data) {
        const isKnownContract = config.isKnownContractAddress(account.address);
        if (isKnownContract) {
            continue;
        }

        const context = {
            checkpoints: checkpoints,
            accountOnFocus: account,
            accounts: accounts,
            contractsSummary: contractsSummary
        };

        await unwrapTokens(context, config, (token, metadata) => metadata.shouldIgnore);
    }

    // Go again, now through all known contracts. Skip already touched tokens.
    for (const account of accounts.data) {
        const isKnownContract = config.isKnownContractAddress(account.address);
        if (!isKnownContract) {
            continue;
        }

        if (config.isFarm(account.address)) {
            continue;
        }

        const context = {
            checkpoints: checkpoints,
            accountOnFocus: account,
            accounts: accounts,
            contractsSummary: contractsSummary
        };

        await unwrapTokens(context, config, (token, metadata) => metadata.isBaseToken || token.touched);
    }

    const outputPath = path.join(workspace, `accounts_with_unwrapped_tokens.json`);
    writeJsonFile(outputPath, accounts.data);

    console.log(JSON.stringify(checkpoints, null, 4));

    const stakingToken = config.getStakingToken();
    const notRedistributedStakingRewards = contractsSummary.getFarmByTokenName(stakingToken).notRedistributedRewards;

    const total = new BigNumber(checkpoints.$foundBaseToken)
        .plus(checkpoints.$recoveredFromStakingFarm)
        .plus(checkpoints.$recoveredStakingFarmRewards)
        .plus(checkpoints.$recoveredFromLpViaMetastaking)
        .plus(checkpoints.$recoveredStakingFarmRewardsViaMetastaking)
        .plus(checkpoints.$recoveredFromLpViaFarm)
        .plus(checkpoints.$recoveredFromLp)
        .plus(notRedistributedStakingRewards);

    console.log("Total token:", total.toFixed(0));
    console.log("Total token (formatted):", new BigNumber(formatAmount(total, 18)).toFormat());
}

async function unwrapTokens(context, config, shouldIgnore) {
    const tokens = context.accountOnFocus.tokens

    for (const token of tokens) {
        const metadata = config.getTokenMetadata(token.name);

        if (shouldIgnore(token, metadata)) {
            continue;
        }

        if (metadata.isMetastakingToken) {
            token.unwrapped = await unwrapMetastakingToken(context, 0, token);
        } else if (metadata.isStakingToken) {
            token.unwrapped = await unwrapStakingToken(context, 0, token);
        } else if (metadata.isLPToken) {
            token.unwrapped = await unwrapLpToken(context, 0, token);
        } else if (metadata.isFarmToken) {
            token.unwrapped = await unwrapLpFarmToken(context, 0, token);
        } else if (metadata.isBaseToken) {
            token.unwrapped = await unwrapBaseToken(context, 0, token);
        } else {
            throw new Error(`unknown token: ${token.name}`);
        }

        if (token.unwrapped?.recovered) {
            token.unwrapped.recoveredFormatted = formatAmount(token.unwrapped.recovered, 18);
        }

        if (token.unwrapped?.rewards) {
            token.unwrapped.rewardsFormatted = formatAmount(token.unwrapped.rewards, 18);
        }
    }
}

async function unwrapBaseToken(context, indentation, baseToken) {
    context.checkpoints.accumulate("$foundBaseToken", baseToken.balance);

    return {
        recovered: baseToken.balance
    };
}

async function unwrapMetastakingToken(context, indentation, metastakingToken) {
    console.log(indent(indentation), "unwrapMetastakingToken()", metastakingToken.name, metastakingToken.nonce);

    const metastakingFarmSummary = context.contractsSummary.getMetastakingFarmByTokenName(metastakingToken.name);
    const stakingFarmSummary = context.contractsSummary.getFarmByTokenName(metastakingFarmSummary.farmTokenId);
    const lpFarmSummary = context.contractsSummary.getFarmByTokenName(metastakingFarmSummary.lpFarmTokenId);
    const poolSummary = context.contractsSummary.getPoolByTokenName(metastakingFarmSummary.lpTokenId);

    const metastakingTokenAttributes = metastakingToken.decodedAttributes;

    // Staking token and LP farm token (positions) are held by the metastaking farm contract.
    const stakingFarmToken = context.accounts.getTokenByAddressAndNameAndNonce(metastakingFarmSummary.contractAddress, metastakingFarmSummary.farmTokenId, metastakingTokenAttributes.stakingFarmTokenNonce);
    const lpFarmToken = context.accounts.getTokenByAddressAndNameAndNonce(metastakingFarmSummary.contractAddress, metastakingFarmSummary.lpFarmTokenId, metastakingTokenAttributes.lpFarmTokenNonce);

    const stakingFarmTokenAttributes = stakingFarmToken.decodedAttributes;
    const lpFarmTokenAttributes = lpFarmToken.decodedAttributes;

    // Handle cases when a holder might have transferred some amount to another account.
    // fractionary amount of owned low-level position =
    //      (owned balance of high-level position) * 
    //      (balance in low-level position when the high-level position was created) / 
    //      (balance in high-level position when high-level position was created).
    //
    // E.g. Alice enters the Metastaking farm with 100 LP, and gets a position of 42 METAUTK. Later, she transfers 2 METAUTK to Bob.
    // Thus, Alice only owns 40 * (100 / 42) = ~95 of the underlying LP (instead of 100).

    const fraction = new BigNumber(metastakingToken.balance).dividedBy(metastakingTokenAttributes.stakingFarmTokenAmount);

    const fractionaryStakingFarmTokenAmount = fraction.multipliedBy(new BigNumber(stakingFarmToken.balance))
    const fractionaryLpFarmTokenAmount = fraction.multipliedBy(new BigNumber(lpFarmToken.balance))

    // We will simulate a "remove_liquidity":
    const lpFirstTokenAmountRecovered = fractionaryLpFarmTokenAmount
        .multipliedBy(poolSummary.reserveFirstToken)
        .dividedBy(poolSummary.lpTokenSupply);

    const stakingFarmRewards = new BigNumber(stakingFarmSummary.rewardPerShare).minus(stakingFarmTokenAttributes.rewardPerShare)
        .multipliedBy(lpFirstTokenAmountRecovered)
        .dividedBy(stakingFarmSummary.divisionSafetyNumber);

    stakingFarmToken.touched = true;
    lpFarmToken.touched = true;

    context.checkpoints.accumulate("$recoveredFromLpViaMetastaking", lpFirstTokenAmountRecovered);
    context.checkpoints.accumulate("$recoveredStakingFarmRewardsViaMetastaking", stakingFarmRewards);

    return {
        recovered: lpFirstTokenAmountRecovered,
        rewards: stakingFarmRewards.toFixed()
    };
}

async function unwrapStakingToken(context, indentation, stakingToken) {
    console.log(indent(indentation), "unwrapStakingToken()", stakingToken.name, stakingToken.nonce);

    const stakingFarmSummary = context.contractsSummary.getFarmByTokenName(stakingToken.name);
    const stakingFarmTokenAttributes = stakingToken.decodedAttributes;
    const tokenType = stakingFarmTokenAttributes.type;
    const recoveredBalance = stakingToken.balance;

    context.checkpoints.accumulate("$recoveredFromStakingFarm", recoveredBalance);

    if (tokenType == "unboundFarmToken") {
        context.checkpoints.accumulate("$stakingInUnbondPeriod", recoveredBalance);

        return {
            recovered: recoveredBalance,
        };
    }

    context.checkpoints.accumulate("$stakingButNotInUnbondPeriod", recoveredBalance);

    if (tokenType == "stakingFarmToken") {
        const rewards = new BigNumber(stakingFarmSummary.rewardPerShare).minus(stakingFarmTokenAttributes.rewardPerShare)
            .multipliedBy(stakingToken.balance)
            .dividedBy(stakingFarmSummary.divisionSafetyNumber);

        context.checkpoints.accumulate("$recoveredStakingFarmRewards", rewards);

        return {
            recovered: recoveredBalance,
            rewards: rewards.toFixed()
        };
    }

    throw new Error(`Unknown token type: ${tokenType}`);
}

async function unwrapLpToken(context, indentation, lpToken) {
    console.log(indent(indentation), "unwrapLpToken()", lpToken.name, lpToken.nonce);

    const poolSummary = context.contractsSummary.getPoolByTokenName(lpToken.name);

    // We will simulate a "remove_liquidity":
    const lpFirstTokenAmountRecovered = new BigNumber(lpToken.balance)
        .multipliedBy(poolSummary.reserveFirstToken)
        .dividedBy(poolSummary.lpTokenSupply);

    context.checkpoints.accumulate("$recoveredFromLp", lpFirstTokenAmountRecovered);

    return {
        lpFirstTokenAmountRecovered: lpFirstTokenAmountRecovered.toFixed(),
        recovered: lpFirstTokenAmountRecovered.toFixed()
    };
}

async function unwrapLpFarmToken(context, indentation, lpFarmToken) {
    console.log(indent(indentation), "unwrapLpFarmToken()", lpFarmToken.name, lpFarmToken.nonce);

    const farmSummary = context.contractsSummary.getFarmByTokenName(lpFarmToken.name);
    const poolSummary = context.contractsSummary.getPoolByTokenName(farmSummary.farmingTokenId);

    // We will simulate a "remove_liquidity":
    const lpFirstTokenAmountRecovered = new BigNumber(lpFarmToken.balance).multipliedBy(poolSummary.reserveFirstToken).dividedBy(poolSummary.lpTokenSupply);

    context.checkpoints.accumulate("$recoveredFromLpViaFarm", lpFirstTokenAmountRecovered);

    return {
        lpFirstTokenAmountRecovered: lpFirstTokenAmountRecovered.toFixed(),
        recovered: lpFirstTokenAmountRecovered.toFixed()
    };
}

function indent(indentation) {
    return ".".repeat(indentation * 4);
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
    unwrapTokens
};
