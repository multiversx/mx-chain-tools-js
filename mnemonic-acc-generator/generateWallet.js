const fs = require('fs');
const { Mnemonic, UserWallet } = require('@elrondnetwork/erdjs');

const { INDEX, WALLET_GENERATION_PASSWORD } = require('./vars.js');

const mnemonicStr = fs.readFileSync("./.mnemonic").toString().trim();
const mnemonic = Mnemonic.fromString(mnemonicStr);
const secretKey = mnemonic.deriveKey(INDEX);

const userWallet = new UserWallet(secretKey, WALLET_GENERATION_PASSWORD);
fs.writeFileSync(`wallet_${INDEX}.json`, JSON.stringify(userWallet.toJSON(), null, 4));

console.log(`generated wallet_${INDEX}.json for address ${secretKey.generatePublicKey().toAddress().bech32()}`);
