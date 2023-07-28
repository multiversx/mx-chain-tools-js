const { BigNumber } = require("bignumber.js");

class BunchOfAccounts {
    constructor(data) {
        this.data = data;

        this.indexTokenByAddressAndNameAndNonce = {};

        for (const account of data) {
            for (const token of account.tokens) {
                const key = this.createIndexKeyByAddressAndNameAndNonce(account.address, token.name, token.nonce);
                this.indexTokenByAddressAndNameAndNonce[key] = token;
            }
        }
    }

    createIndexKeyByAddressAndNameAndNonce(address, name, nonce) {
        return `${address}:${name}:${nonce}`;
    }

    getTokenByAddressAndNameAndNonce(address, name, nonce) {
        const key = this.createIndexKeyByAddressAndNameAndNonce(address, name, nonce);
        const token = this.indexTokenByAddressAndNameAndNonce[key];

        if (!token) {
            throw new Error(`cannot find token by key: ${key}`);
        }

        return token;
    }
}

class ContractsSummary {
    constructor(data) {
        this.data = data;
    }

    getFarmByTokenName(farmTokenName) {
        const metadata = this.data.farms[farmTokenName];
        if (!metadata) {
            throw new Error(`cannot get metadata for farm token: ${farmTokenName}`);
        }

        return metadata;
    }

    getMetastakingFarmByTokenName(metastakingTokenName) {
        const metadata = this.data.metastakingFarms[metastakingTokenName];
        if (!metadata) {
            throw new Error(`cannot get metadata for metastaking token: ${metastakingTokenName}`);
        }

        return metadata;
    }

    getPoolByTokenName(tokenName) {
        const metadata = this.data.pools[tokenName];
        if (!metadata) {
            throw new Error(`cannot get metadata for pool: ${tokenName}`);
        }

        return metadata;
    }

    getHatomMoneyMarketByTokenName(tokenName) {
        const metadata = this.data.hatomMoneyMarkets[tokenName];
        if (!metadata) {
            throw new Error(`cannot get metadata for hatom contract: ${tokenName}`);
        }

        return metadata;
    }
}

function formatAmount(amount, numDecimals) {
    return new BigNumber(amount).shiftedBy(-numDecimals).toFixed(numDecimals);
}

module.exports = {
    BunchOfAccounts,
    ContractsSummary,
    formatAmount
};
