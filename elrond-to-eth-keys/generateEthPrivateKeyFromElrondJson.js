const fs = require('fs');
const ethers = require('ethers');
const { KEYFILE, PASSWORD } = require('./vars');
const { UserWallet } = require('@elrondnetwork/erdjs-walletcore');

const k = fs.readFileSync(KEYFILE);
const sk = UserWallet.decryptSecretKey(JSON.parse(k), PASSWORD);

let ethHDNode =  ethers.utils.HDNode.fromSeed(sk.valueOf());
ethHDNode = ethHDNode.derivePath(`m/44'/60'/0'/0/0`);

const ethWallet = new ethers.Wallet(ethHDNode.privateKey);
console.log(ethWallet.address);

function generateEthWallet(mnemonic, index = 0) {
    let hdnode = ethers.utils.HDNode.fromMnemonic("mnemonic");
    hdnode = hdnode.derivePath(`m/44'/60'/0'/0/${index}`);
    return new ethers.Wallet(hdnode.privateKey);
}
