const fs = require('fs');
const ethers = require('ethers');
const { SHARD_ID } = require('./vars');
const { Mnemonic, UserWallet } = require('@elrondnetwork/erdjs-walletcore');

while (true) {
  const m = Mnemonic.generate();
  const secretKey = m.deriveKey(0);
  const addr = secretKey.generatePublicKey().toAddress().bech32();
  const shardID = computeShardID(secretKey.generatePublicKey().valueOf());

  if ( shardID !== SHARD_ID ) {
    continue;
  }

  const keyToEncode = Buffer.concat([secretKey.valueOf(), secretKey.generatePublicKey().valueOf()]);
  const pemFile = generatePEM(addr, keyToEncode);
  const ethWallet = generateEthWallet(m.toString());

  const fileNameElrond = process.argv[2] || addr;
  const filenameEth = process.argv[2] || ethWallet.address;

  const keyfile = new UserWallet(secretKey, "");

  fs.writeFileSync(`${fileNameElrond}.pem`, pemFile);
  fs.writeFileSync(`${fileNameElrond}.json`, JSON.stringify(keyfile.toJSON()));
  fs.writeFileSync(`${filenameEth}.sk`, ethWallet.privateKey.slice(2));
  fs.writeFileSync(`${fileNameElrond}.mnemonic`, m.toString());

  console.log(`Generated Elrond Pem ${fileNameElrond}.pem with address: ${addr}`);
  console.log(`Generated Ethereum SK ${filenameEth}.sk with address: ${ethWallet.address}`);
  console.log(`Generated mnemonic file ${fileNameElrond}.mnemonic`);

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
}

function generatePEM(address, privateKey) {
  let keyBuff = [];
  [...privateKey.toString('hex')].map(hexBuff => keyBuff.push(Buffer.from(hexBuff)));

  return `-----BEGIN PRIVATE KEY for ${address}-----\r\n${Buffer.concat(keyBuff).toString('base64')}\r\n-----END PRIVATE KEY for ${address}-----`
}

function generateEthWallet(mnemonic, index = 0) {
  let hdnode = ethers.utils.HDNode.fromMnemonic(mnemonic);
  hdnode = hdnode.derivePath(`m/44'/60'/0'/0/${index}`);
  return new ethers.Wallet(hdnode.privateKey);
}
