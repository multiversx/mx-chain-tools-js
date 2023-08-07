# Tokens snaphotting

At times, we need to take balance snapshots for all addresses on the chain, at a given round, for a specific token (or a family of tokens _derived_ from a **base token**).

## General approach

The snapshotting process is as follows:
 - decide on a round for the snapshot
 - download non-pruned archives (i.e. deep history archives) for the epoch that contains the chosen round, plus for the previous epoch
 - extract the chain state from the archives (i.e. `AccountsTrie`)
 - find the state _root hashes_ for the chosen round, for each shard
 - for each shard, walk over the chain state (at the previously-found root hash) and extract the token balance for each address (be it user or smart contract), accumulate the data, then decode and interpret token attributes (if applicable);
 - from the chain state (at the previously-found root hash), extract the storage (key-value pairs) of some contracts of interest (e.g. xExchange farms), then decode this data;
 - interpret the data (token attributes and contracts state) in order to unwrap the underlying amount of the _base token_ from eventual derived tokens, for each address (e.g. unwrap `METAUTK-*` to recover the underlying `UTK` amount);
 - report the results (e.g. top holders) in a human-readable format. 

The steps described above are mostly automated by the tools and scripts in this repository.

## On-line approach

You can also do a tokens snapshot in an on-line fashion, without the use of deep history archives. This is useful for quick checks of a specific address, at a specific round. However, this approach is not suitable for taking a snapshot of all addresses on the chain.

## Prerequisites

For the general approach, the script invoke, at some point, the following tools:
 - [`tokensExporter`](https://github.com/multiversx/mx-chain-tools-go/tree/main/trieTools/tokensExporter)
 - [`accountStorageExporter`](https://github.com/multiversx/mx-chain-tools-go/tree/main/trieTools/accountStorageExporter)

Thus, make sure to have them built (installed) and available in your `PATH`.

## Glossary

 - `base token`: the token for which we are taking the snapshot (e.g. the fungible token `UTK-2f80e9`)

## Make a snapshot (general approach)

### Download epoch archives

Download both `EPOCH` and `EPOCH_BEFORE` in `WORKSPACE`, for each shard. 

Make sure the chosen epoch contains the round you want to snapshot.

E.g.

```
export WORKSPACE=~/myworkspace
export BASE_URL=https://deep-history-archives.fra1.digitaloceanspaces.com
export EPOCH=1088
export EPOCH_BEFORE=1087

mkdir -p ${WORKSPACE}/shard-0 && cd ${WORKSPACE}/shard-0
wget ${BASE_URL}/mainnet/shard-0/Epoch_${EPOCH_BEFORE}.tar
wget ${BASE_URL}/mainnet/shard-0/Epoch_${EPOCH}.tar

mkdir -p ${WORKSPACE}/shard-1 && cd ${WORKSPACE}/shard-1
wget ${BASE_URL}/mainnet/shard-1/Epoch_${EPOCH_BEFORE}.tar
wget ${BASE_URL}/mainnet/shard-1/Epoch_${EPOCH}.tar

mkdir -p ${WORKSPACE}/shard-2 && cd ${WORKSPACE}/shard-2
wget ${BASE_URL}/mainnet/shard-2/Epoch_${EPOCH_BEFORE}.tar
wget ${BASE_URL}/mainnet/shard-2/Epoch_${EPOCH}.tar

echo "Done."
```

In the end, the `WORKSPACE` directory should contain the archives, as follows (example for chosen epoch):

```
├── shard-0
│   ├── Epoch_1087.tar
│   └── Epoch_1088.tar
├── shard-1
│   ├── Epoch_1087.tar
│   └── Epoch_1088.tar
├── shard-2
│   ├── Epoch_1087.tar
│   └── Epoch_1088.tar
```

### Extract the chain data

Run the following script to extract the chain state from the archives:

```
export WORKSPACE=~/myworkspace
export ROUND=15678680
export GATEWAY=https://gateway.multiversx.com
export CONFIG=./config/mainnet-utk-v0.1.0.config.json

node ./src/stepExportData.js --workspace=${WORKSPACE} --round=${ROUND} --gateway=${GATEWAY} --config=${CONFIG}
```

Under the hood, the script un-tars the archives, then extracts the data using the tools mentioned above (`tokensExporter` and `accountStorageExporter`). The extraction is guided by the provided configuration file.

### Decode and interpret the data

```
export WORKSPACE=~/utk

node ./src/stepDecodeState.js --workspace=${WORKSPACE} --config=${CONFIG}
node ./src/stepUnwrapTokens.js --workspace=${WORKSPACE} --config=${CONFIG}
node ./src/stepReport.js --workspace=${WORKSPACE} --config=${CONFIG} --tag=example
```

## Make a single-address snapshot (on-line approach)

You can get a snapshot for a given address (and round) as follows:

```
export ADDRESS=erd1qyu5wthldzr8wx5c9ucg8kjagg0jfs53s8nr3zpz3hypefsdd8ssycr6th

node ./unwrapTokensOnline.js --config=${CONFIG} --round=${ROUND} --address=${ADDRESS} --outfile=online_${ADDRESS}.json
```
