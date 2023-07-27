const fs = require("fs");
const path = require("path");

const CACHE_DIR = "_diskcache_";

async function get(key) {
    ensureCacheDirExists();

    const file = path.join(CACHE_DIR, `${key}.json`);
    if (!fs.existsSync(file)) {
        return null;
    }

    const content = fs.readFileSync(file, { encoding: "utf8" });
    const data = JSON.parse(content);
    return data;
}

async function put(key, data) {
    ensureCacheDirExists();

    const file = path.join(CACHE_DIR, `${key}.json`);
    const content = JSON.stringify(data, null, 4);
    fs.writeFileSync(file, content, { encoding: "utf8" });
}

function ensureCacheDirExists() {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR);
    }
}

module.exports = {
    get: get,
    put: put
};
