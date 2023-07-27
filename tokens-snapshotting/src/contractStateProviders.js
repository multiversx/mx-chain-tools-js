const fs = require("fs");
const path = require("path");

class FilesystemContractStateProvider {
    constructor(dataRoot) {
        this.dataRoot = dataRoot;
    }

    async getState({ stateFilename }) {
        const inputPath = path.join(this.dataRoot, stateFilename);
        const stateJson = fs.readFileSync(inputPath, { encoding: "utf8" });
        const state = JSON.parse(stateJson);
        return state;
    }
}

class NetworkContractStateProvider {
    constructor(networkProvider, blockInfoByShard) {
        this.networkProvider = networkProvider;
        this.blockInfoByShard = blockInfoByShard;
    }

    async getState({ address }) {
        // Temporary workaround, assume shard = 1 (DEX contracts are in shard 1).
        const blockInfo = this.blockInfoByShard[1];
        const blockNonce = blockInfo.nonce;
        const cacheKey = `contract-state-${address}-${blockNonce}`;

        const cachedState = await diskcache.get(cacheKey);
        if (cachedState) {
            console.log("NetworkContractStateProvider.getState() - cache hit", address);
            return cachedState;
        }

        console.log("NetworkContractStateProvider.getState() - cache miss", address);

        const url = `address/${address}/keys?blockNonce=${blockInfo.nonce}`;
        const data = await this.networkProvider.doGetGeneric(url);
        const state = data.pairs;

        await diskcache.put(cacheKey, state);

        return state;
    }
}

module.exports = {
    FilesystemContractStateProvider,
    NetworkContractStateProvider
};
