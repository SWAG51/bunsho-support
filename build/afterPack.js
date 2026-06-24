// macOSビルド後、@electron/osx-sign で「正しい順序の」アドホック署名を行う。
// electron-builder 単体は証明書が無いと署名をスキップ（=未署名=arm64で「壊れている」）するため、
// ここで osx-sign を直接呼ぶ。
//
// 重要: アドホック署名のElectronを arm64 で起動するには、本体が自分のフレームワーク
// （ad-hoc署名・Team IDなし）を読み込めるよう、entitlements で
//   com.apple.security.cs.disable-library-validation（ライブラリ検証免除）
// を付け、かつ hardenedRuntime を有効（osx-signの既定）にしてこの権限を効かせる必要がある。
// これが無いと dyld が「different Team IDs」で起動時クラッシュする。
// V8 のため allow-jit / allow-unsigned-executable-memory も付与。
const path = require('path');

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return;
  const { signAsync } = require('@electron/osx-sign');
  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );
  // @electron/osx-sign 1.x では entitlements は optionsForFile コールバック経由でのみ有効。
  // 全部品に同じ権限（ライブラリ検証免除＋V8用JIT）を適用する。
  const entitlements = [
    'com.apple.security.cs.allow-jit',
    'com.apple.security.cs.allow-unsigned-executable-memory',
    'com.apple.security.cs.disable-library-validation',
    'com.apple.security.cs.allow-dyld-environment-variables',
  ];
  await signAsync({
    app: appPath,
    identity: '-',             // アドホック署名
    identityValidation: false, // キーチェーン照合をしない
    preAutoEntitlements: false, // 指定した entitlements をそのまま使う
    optionsForFile: () => ({ entitlements, hardenedRuntime: true }),
    type: 'distribution',
    platform: 'darwin',
  });
  console.log('[afterPack] ad-hoc signed (osx-sign, LV-disabled):', appPath);
};
