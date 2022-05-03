const { SHARD_ID } = require('./vars');
const { Mnemonic } = require('@elrondnetwork/erdjs');

while (true) {
  const m = Mnemonic.generate();
  const secretKey = m.deriveKey(0);
  const addr = secretKey.generatePublicKey().toAddress().bech32();
  const shardID = computeShardID(secretKey.generatePublicKey().valueOf());

  if ( shardID !== SHARD_ID ) {
    continue;
  }

  console.log(`found mnemonic for shard ${SHARD_ID} with address: ${addr}`);
  console.log(m.toString());

  break;
}

function computeShardID(pubKey) {
  const startingIndex = pubKey.length - 1;

  const usedBuffer = pubKey.slice(startingIndex);

  let addr = 0;
  for (let i = 0; i < usedBuffer.length; i++) {
    addr = (addr<<8) + usedBuffer[i];
  }

  let n = Math.ceil(Math.log2(3));
  let maskHigh = (1 << n) - 1;
  let maskLow = (1 << (n-1)) - 1;

  let shard = addr & maskHigh;
  if ( shard > 2 ) {
    shard = addr & maskLow;
  }

  return shard;
};
