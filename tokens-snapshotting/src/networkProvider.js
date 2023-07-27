const { ProxyNetworkProvider } = require("@multiversx/sdk-network-providers");

class NetworkProvider extends ProxyNetworkProvider {
    constructor(url) {
        super(url);
    }

    async getBlockInfoInRoundByShard(round) {
        const data = await this.doGetGeneric(`blocks/by-round/${round}`);
        const blocks = data.blocks;
        const result = {};

        for (const block of blocks) {
            result[block.shard] = {
                rootHash: block.stateRootHash,
                nonce: block.nonce,
                epoch: block.epoch
            };
        }

        return result;
    }
}

module.exports = {
    NetworkProvider
};
