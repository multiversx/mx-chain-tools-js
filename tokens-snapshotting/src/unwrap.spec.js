const step_decode_state = require("./step_decode_state");
const step_unwrap_tokens = require("./step_unwrap_tokens");
const step_report = require("./step_report");
const { readTextFile, readJsonFile } = require("./filesystem");
const { assert } = require("chai");
const { BigNumber } = require("bignumber.js");

BigNumber.config({ DECIMAL_PLACES: 128, ROUNDING_MODE: BigNumber.ROUND_DOWN });

describe("test decode and unwrap", async function () {
    it("should work", async function () {
        this.timeout(10000);

        await step_decode_state.main(["--workspace=./testdata/15678680"]);
        await step_unwrap_tokens.main(["--workspace=./testdata/15678680"]);
        await step_report.main(["--workspace=./testdata/15678680", "--outfile=./testdata/15678680/ranking.txt"]);

        const actualUnwrapped = readJsonFile("./testdata/15678680/users_with_unwrapped_tokens.json");
        const expectedUnwrapped = readJsonFile("./testdata/15678680/expected_users_with_unwrapped_tokens.json");

        assert.equal(actualUnwrapped.length, expectedUnwrapped.length);

        for (let i = 0; i < actualUnwrapped.length; i++) {
            assert.deepEqual(actualUnwrapped[i], expectedUnwrapped[i]);
        }

        const actualRanking = readTextFile("./testdata/15678680/ranking.txt").trim();
        const expectedRanking = readTextFile("./testdata/15678680/expected_ranking.txt").trim();

        const actualLines = actualRanking.split("\n");
        const expectedLines = expectedRanking.split("\n");

        assert.equal(actualLines.length, expectedLines.length);

        for (let i = 0; i < actualLines.length; i++) {
            assert.equal(actualLines[i], expectedLines[i]);
        }
    });
});
