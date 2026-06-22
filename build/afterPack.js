// macOSビルド時にアプリをアドホック署名する（Apple Siliconの「壊れている」回避）。
// 証明書が無くても codesign -s - で“ローカル有効な署名”を付け、署名の seal を成立させる。
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appName = context.packager.appInfo.productFilename + '.app';
  const appPath = path.join(context.appOutDir, appName);
  try {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
      stdio: 'inherit',
    });
    console.log('[afterPack] ad-hoc signed:', appPath);
  } catch (e) {
    console.error('[afterPack] ad-hoc sign failed:', e.message);
  }
};
