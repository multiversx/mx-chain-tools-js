const { ProxyNetworkProvider } = require("@multiversx/sdk-network-providers");

const timeout = 10000;

class NetworkProvider extends ProxyNetworkProvider {
    constructor(url) {
        super(url, { timeout: timeout });
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

    async getTransactionsInBlock({ shard, nonce }) {
        const data = await this.doGetGeneric(`block/${shard}/by-nonce/${nonce}?withTxs=true`);
        const block = data.block;
        const transactions = [];

        for (const miniblock of block.miniBlocks || []) {
            for (const transaction of miniblock.transactions || []) {
                transactions.push(transaction);
            }
        }

        return transactions;
    }
}

module.exports = {
    NetworkProvider
};
