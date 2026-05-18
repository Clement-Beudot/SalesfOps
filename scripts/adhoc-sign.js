const { execSync } = require('child_process');
const path = require('path');

module.exports = async function (context) {
    if (context.electronPlatformName !== 'darwin') return;
    const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productName}.app`);
    console.log(`Ad-hoc signing: ${appPath}`);
    execSync(`codesign --force --deep --sign - "${appPath}"`);
};
