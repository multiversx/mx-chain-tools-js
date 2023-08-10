const { readJsonFile } = require("./filesystem");

class Config {
    constructor(data) {
        Object.assign(this, data);

        this.indexTagByAddress = {};
        this.indexKnownContractByAddress = {};

        for (const item of this.farms) {
            this.indexTagByAddress[item.address] = `farm-${item.token}`;
            this.indexKnownContractByAddress[item.address] = item;
        }

        for (const item of this.metastakingFarms) {
            this.indexTagByAddress[item.address] = `metastaking-farm-${item.token}`;
            this.indexKnownContractByAddress[item.address] = item;
        }

        for (const item of this.pools) {
            this.indexTagByAddress[item.address] = `pool-${item.token}`;
            this.indexKnownContractByAddress[item.address] = item;
        }
    }

    static load(filename) {
        const data = readJsonFile(filename);
        return new Config(data);
    }

    getTokenMetadata(tokenName) {
        const metadata = this.tokensMetadata[tokenName];
        if (!metadata) {
            throw new Error(`cannot get metadata for token: ${tokenName}`);
        }

        return metadata;
    }

    getStakingToken() {
        for (const [tokenName, metadata] of Object.entries(this.tokensMetadata)) {
            if (metadata.isStakingToken) {
                return tokenName;
            }
        }

        throw new Error("cannot find staking token");
    }

    getTagOfAddress(address) {
        return this.indexTagByAddress[address];
    }

    getKnownContractsAddresses() {
        return Object.keys(this.indexKnownContractByAddress);
    }

    isKnownContractAddress(address) {
        return this.indexKnownContractByAddress[address] !== undefined;
    }

    isFarm(address) {
        const tag = this.getTagOfAddress(address);
        return tag && tag.indexOf("farm") == 0;
    }
}

module.exports = {
    Config
};
