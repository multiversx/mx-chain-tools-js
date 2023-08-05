const { BigNumber } = require("bignumber.js");
const { formatAmount } = require("./utils.js");

class Checkpoints {
    constructor() {
    }

    accumulate(propertyName, amount) {
        if (!this[propertyName]) {
            this[propertyName] = "0";
        }

        this[propertyName] = new BigNumber(this[propertyName]).plus(amount).toFixed();
    }

    toJSON() {
        const result = {};

        for (const propertyName of Object.keys(this)) {
            result[propertyName] = new BigNumber(this[propertyName]).toFixed(0);

            if (propertyName.startsWith("$")) {
                result[`${propertyName}Formatted`] = new BigNumber(formatAmount(this[propertyName], 18)).toFormat();
            }
        }

        return result;
    }
}

module.exports = {
    Checkpoints
};
