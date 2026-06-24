// macOSビルド後、@electron/osx-sign で「正しい順序の」アドホック署名を行う。
// electron-builder 単体は証明書が無いと署名をスキップ（=未署名=arm64で「壊れている」）するため、
// ここで osx-sign を直接呼ぶ。identity '-' + identityValidation:false でキーチェーン照合を
// 飛ばし、内側の Framework/Helper から順に codesign -s -（アドホック）していく。
// hardenedRuntime:false でライブラリ検証を無効化し、起動時の SIGTRAP を防ぐ。
const path = require('path');

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return;
  const { signAsync } = require('@electron/osx-sign');
  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );
  await signAsync({
    app: appPath,
    identity: '-',            // アドホック署名
    identityValidation: false, // キーチェーン照合をしない
    hardenedRuntime: false,    // ライブラリ検証を無効化
    gatekeeperAssess: false,
    type: 'distribution',
    platform: 'darwin',
  });
  console.log('[afterPack] ad-hoc signed (osx-sign):', appPath);
};
