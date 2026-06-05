import fs from 'node:fs';
import path from 'node:path';

const swPath = path.resolve('sw.js');
let content = fs.readFileSync(swPath, 'utf8');

let bumped = false;
content = content.replace(/const CACHE = 'bigmario-v(\d+)';/, (match, version) => {
    bumped = true;
    const newVersion = parseInt(version, 10) + 1;
    console.log(`Bumping cache from v${version} to v${newVersion} in sw.js`);
    return `const CACHE = 'bigmario-v${newVersion}';`;
});

if (bumped) {
    fs.writeFileSync(swPath, content);
} else {
    console.error("Could not find CACHE version in sw.js");
}
