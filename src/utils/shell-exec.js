const { exec } = require('child_process');

let cachedEnv = null;

function resolveEnv() {
    if (cachedEnv) return Promise.resolve(cachedEnv);
    return new Promise((resolve) => {
        const shell = process.env.SHELL || '/bin/bash';
        exec(`${shell} -l -i -c 'echo $PATH'`, (error, stdout) => {
            const resolvedPath = (!error && stdout.trim())
                ? stdout.trim()
                : `/usr/local/bin:/opt/homebrew/bin:${process.env.PATH || '/usr/bin:/bin'}`;
            cachedEnv = { ...process.env, PATH: resolvedPath };
            resolve(cachedEnv);
        });
    });
}

function shellExec(command, callback) {
    resolveEnv().then(env => exec(command, { env }, callback));
}

module.exports = { resolveEnv, shellExec };
