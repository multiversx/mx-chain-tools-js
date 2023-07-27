const fs = require("fs");
const { homedir } = require("os");

function asUserPath(userPath) {
    return (userPath || "").toString().replace("~", homedir);
}

function readJsonFile(path) {
    console.log("readJsonFile()", path);

    const json = fs.readFileSync(path, { encoding: "utf8" });
    const data = JSON.parse(json);
    return data;
}

function writeJsonFile(outputPath, data) {
    console.log("writeJsonFile()", outputPath);

    const json = JSON.stringify(data, null, 4);
    fs.writeFileSync(outputPath, json, { encoding: "utf8" });
}

function writeTextFile(outputPath, lines) {
    console.log("writeTextFile()", outputPath);

    fs.writeFileSync(outputPath, lines.join("\n"), { encoding: "utf8" });
}

function readTextFile(path) {
    console.log("readTextFile()", path);

    const text = fs.readFileSync(path, { encoding: "utf8" });
    return text;
}

module.exports = {
    asUserPath,
    readJsonFile,
    writeJsonFile,
    writeTextFile,
    readTextFile
};
