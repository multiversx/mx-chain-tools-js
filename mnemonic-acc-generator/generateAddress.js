const fs = require('fs');
const { Mnemonic } = require('@elrondnetwork/erdjs');

const { INDEX } = require('./vars.js');

const mnemonicStr = fs.readFileSync("./.mnemonic").toString().trim();
const mnemonic = Mnemonic.fromString(mnemonicStr);
const secretKey = mnemonic.deriveKey(INDEX);

console.log(secretKey.generatePublicKey().toAddress().bech32());
