const path = require("path");
const { BigNumber } = require("bignumber.js");
const { asUserPath, readJsonFile, writeJsonFile } = require("./filesystem");
const { BunchOfAccounts, ContractsSummary, formatAmount } = require("./utils.js");
const minimist = require("minimist");

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

    const config = readJsonFile(configFile);

    const usersData = readJsonFile(path.join(workspace, `users_with_decoded_attributes.json`))
    const users = new BunchOfAccounts(usersData);

    const contractsData = readJsonFile(path.join(workspace, `contracts_with_decoded_attributes.json`));
    const contracts = new BunchOfAccounts(contractsData);

    const contractsSummaryData = readJsonFile(path.join(workspace, `contracts_summary.json`));
    const contractsSummary = new ContractsSummary(contractsSummaryData);

    const context = {
        contracts: contracts,
        contractsSummary: contractsSummary
    };

    for (const account of users.data) {
        await unwrapTokens(context, account.tokens, config.tokensMetadata);
    }

    const outputPath = path.join(workspace, `users_with_unwrapped_tokens.json`);
    writeJsonFile(outputPath, users.data);
}

async function unwrapTokens(context, tokens, tokensMetadata) {
    for (const token of tokens) {
        const metadata = tokensMetadata[token.name];

        if (!metadata) {
            throw new Error(`missing metadata for token: ${token.name}`);
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
            token.unwrapped = {
                recovered: token.balance
            };
        } else if (metadata.isHatomMoneyMarketToken) {
            token.unwrapped = await unwrapHatomMoneyMarketToken(context, 0, token);
        } else {
            throw new Error(`unknown token: ${token.name}`);
        }

        if (token?.unwrapped?.recovered) {
            token.unwrapped.recoveredFormatted = formatAmount(token.unwrapped.recovered, 18);
        }

        if (token?.unwrapped?.rewards) {
            token.unwrapped.rewardsFormatted = formatAmount(token.unwrapped.rewards, 18);
        }
    }
}

async function unwrapMetastakingToken(context, indentation, metastakingToken) {
    console.log(indent(indentation), "unwrapMetastakingToken()", metastakingToken.name, metastakingToken.nonce);

    const metastakingFarmSummary = context.contractsSummary.getMetastakingFarmByTokenName(metastakingToken.name);
    const stakingFarmSummary = context.contractsSummary.getFarmByTokenName(metastakingFarmSummary.farmTokenId);
    const lpFarmSummary = context.contractsSummary.getFarmByTokenName(metastakingFarmSummary.lpFarmTokenId);
    const poolSummary = context.contractsSummary.getPoolByTokenName(metastakingFarmSummary.lpTokenId);

    const metastakingTokenAttributes = metastakingToken.decodedAttributes;

    // Staking token and LP farm token (positions) are held by the metastaking farm contract.
    const stakingFarmToken = context.contracts.getTokenByAddressAndNameAndNonce(metastakingFarmSummary.contractAddress, metastakingFarmSummary.farmTokenId, metastakingTokenAttributes.stakingFarmTokenNonce);
    const lpFarmToken = context.contracts.getTokenByAddressAndNameAndNonce(metastakingFarmSummary.contractAddress, metastakingFarmSummary.lpFarmTokenId, metastakingTokenAttributes.lpFarmTokenNonce);

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

    console.log(indent(indentation + 1), "fractionaryStakingFarmTokenAmount", fractionaryStakingFarmTokenAmount.toFixed());
    console.log(indent(indentation + 1), "fractionaryLpFarmTokenAmount", fractionaryLpFarmTokenAmount.toFixed());

    const stakingFarmRewards = new BigNumber(stakingFarmSummary.rewardPerShare).minus(stakingFarmTokenAttributes.rewardPerShare)
        .multipliedBy(fractionaryStakingFarmTokenAmount)
        .dividedBy(stakingFarmSummary.divisionSafetyNumber);

    const lpFarmFarmedAmount = new BigNumber(lpFarmSummary.rewardPerShare).minus(lpFarmTokenAttributes.rewardPerShare)
        .multipliedBy(fractionaryLpFarmTokenAmount)
        .dividedBy(lpFarmSummary.divisionSafetyNumber);

    console.log(indent(indentation + 1), "stakingFarmRewards", stakingFarmRewards.toFixed());
    console.log(indent(indentation + 1), "lpFarmFarmedAmount", lpFarmFarmedAmount.toFixed());

    // We will simulate a "remove_liquidity":
    const lpFirstTokenAmountRecovered = fractionaryLpFarmTokenAmount.multipliedBy(poolSummary.reserveFirstToken).dividedBy(poolSummary.lpTokenSupply);

    console.log(indent(indentation + 1), "lpFirstTokenAmountRecovered", lpFirstTokenAmountRecovered.toFixed());

    return {
        fractionaryLpFarmTokenAmount: fractionaryLpFarmTokenAmount.toFixed(),
        lpFirstTokenAmountRecovered: lpFirstTokenAmountRecovered.toFixed(),
        recovered: lpFirstTokenAmountRecovered.toFixed(),
        rewards: stakingFarmRewards.toFixed()
    }
}

async function unwrapStakingToken(context, indentation, stakingToken) {
    console.log(indent(indentation), "unwrapStakingToken()", stakingToken.name, stakingToken.nonce);

    const stakingFarmSummary = context.contractsSummary.getFarmByTokenName(stakingToken.name);
    const stakingFarmTokenAttributes = stakingToken.decodedAttributes;
    const tokenType = stakingFarmTokenAttributes.type;

    if (tokenType == "unboundFarmToken") {
        return {
            recovered: stakingToken.balance,
        };
    }

    if (tokenType == "stakingFarmToken") {
        const rewards = new BigNumber(stakingFarmSummary.rewardPerShare).minus(stakingFarmTokenAttributes.rewardPerShare)
            .multipliedBy(stakingToken.balance)
            .dividedBy(stakingFarmSummary.divisionSafetyNumber);

        return {
            recovered: stakingToken.balance,
            rewards: rewards.toFixed()
        };
    }

    throw new Error(`Unknown token type: ${tokenType}`);
}

async function unwrapLpToken(context, indentation, lpToken) {
    console.log(indent(indentation), "unwrapLpToken()", lpToken.name, lpToken.nonce);

    const poolSummary = context.contractsSummary.getPoolByTokenName(lpToken.name);

    // We will simulate a "remove_liquidity":
    const lpFirstTokenAmountRecovered = new BigNumber(lpToken.balance).multipliedBy(poolSummary.reserveFirstToken).dividedBy(poolSummary.lpTokenSupply);

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

    return {
        lpFirstTokenAmountRecovered: lpFirstTokenAmountRecovered.toFixed(),
        recovered: lpFirstTokenAmountRecovered.toFixed()
    };
}

async function unwrapHatomMoneyMarketToken(context, indentation, hatomToken) {
    console.log("unwrapHatomMoneyMarketToken()", hatomToken.name, hatomToken.nonce);

    const marketSummary = context.contractsSummary.getHatomMoneyMarketByTokenName(hatomToken.name);
    const liquidity = new BigNumber(marketSummary.liquidity);
    const totalSupply = new BigNumber(marketSummary.totalSupply);
    const underlyingAmount = liquidity.multipliedBy(hatomToken.balance).dividedBy(totalSupply);

    return {
        recovered: underlyingAmount.toFixed()
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
