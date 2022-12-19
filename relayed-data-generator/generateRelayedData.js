const {RelayedTransactionV2Builder, Transaction, Address, TransactionPayload} = require('@elrondnetwork/erdjs');
const {Mnemonic, UserSigner} = require('@elrondnetwork/erdjs-walletcore');
const {ProxyNetworkProvider} = require('@elrondnetwork/erdjs-network-providers');
const {MNEMONIC_STR, GATEWAY, CONTRACT_ADDRESS, GAS_LIMIT, CHAIN_ID, DATA_FIELD} = require('./vars.js');

const mnemonic = Mnemonic.fromString(MNEMONIC_STR);
const secretKey = mnemonic.deriveKey(0);

const main = async _ => {
    const proxy = new ProxyNetworkProvider(GATEWAY);
    const innerTxAcc = await proxy.getAccount(secretKey.generatePublicKey().toAddress());

    const innerTx = new Transaction({
        nonce: innerTxAcc.nonce,
        sender: secretKey.generatePublicKey().toAddress(),
        receiver: Address.fromBech32(CONTRACT_ADDRESS),
        gasLimit: 0,
        chainID: CHAIN_ID,
        data: new TransactionPayload(DATA_FIELD),
    });

    const signer = new UserSigner(secretKey);
    await signer.sign(innerTx);

    console.log(innerTx.signature.hex());

    let networkConfig = {
        MinGasLimit: 50_000,
        GasPerDataByte: 1_500,
        GasPriceModifier: 0.01,
        ChainID: CHAIN_ID,
    };
    let builder = new RelayedTransactionV2Builder();
    const relayedTxV2 = builder
        .setInnerTransaction(innerTx)
        .setInnerTransactionGasLimit(GAS_LIMIT)
        .setRelayerNonce(0)
        .setNetworkConfig(networkConfig)
        .setRelayerAddress(Address.fromBech32(CONTRACT_ADDRESS),)
        .build();

    console.log({
        to: relayedTxV2.getReceiver().bech32(),
        data: relayedTxV2.data.toString(),
        totalGas: relayedTxV2.getGasLimit().valueOf()
    })
};

main().then();
