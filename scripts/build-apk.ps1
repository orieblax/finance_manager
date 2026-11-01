# ==============================================================================
# Personal Finance Manager - Automated Android TWA APK Build Script
# ==============================================================================
param(
    [string]$KeystorePass = "pfmandroid123",
    [string]$Alias = "pfm-key"
)

$ErrorActionPreference = "Stop"

$root = (Get-Item $PSScriptRoot).Parent.FullName
$twaDir = Join-Path $root "android-twa"
$ksPath = Join-Path $twaDir "android.keystore"
$jdkBin = "C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot\bin"
$keytool = Join-Path $jdkBin "keytool.exe"

Write-Host "=========================================================="
Write-Host " Building Personal Finance Manager Android TWA APK"
Write-Host "=========================================================="

# 1. Verify or create Release Signing Keystore
if (-not (Test-Path $ksPath)) {
    Write-Host "[1/4] Generating release keystore at $ksPath..."
    & $keytool -genkeypair -v -keystore $ksPath -alias $Alias -keyalg RSA -keysize 2048 -validity 10000 -storepass $KeystorePass -keypass $KeystorePass -dname "CN=Personal Finance Manager, OU=Mobile, O=Orieblax, L=Medellin, ST=Antioquia, C=CO"
} else {
    Write-Host "[1/4] Found existing keystore: $ksPath"
}

# 2. Extract SHA-256 Fingerprint
Write-Host "[2/4] Reading certificate SHA-256 fingerprint..."
$certInfo = & $keytool -list -v -keystore $ksPath -alias $Alias -storepass $KeystorePass
$fingerprint = ""
foreach ($line in $certInfo) {
    if ($line -match "SHA256:\s*([A-F0-9:]+)") {
        $fingerprint = $matches[1].Trim()
        break
    }
}
Write-Host "       SHA-256: $fingerprint"

# 3. Synchronize assetlinks.json
$assetlinksPath = Join-Path $root "frontend\public\.well-known\assetlinks.json"
$assetlinksContent = @"
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.orieblax.financemanager",
      "sha256_cert_fingerprints": [
        "$fingerprint"
      ]
    }
  }
]
"@
Set-Content -Path $assetlinksPath -Value $assetlinksContent -Encoding utf8
Write-Host "[3/4] Updated $assetlinksPath"

# 4. Check / Setup Android SDK & Build APK
Write-Host "[4/4] Checking Android SDK environment..."
$sdkDir = "$env:LOCALAPPDATA\Android\Sdk"
if (-not (Test-Path $sdkDir)) {
    $sdkDir = "C:\Android\Sdk"
}
if (-not (Test-Path $sdkDir)) {
    $sdkDir = "$env:USERPROFILE\android-sdk"
}

$localProps = Join-Path $twaDir "local.properties"
if (Test-Path $sdkDir) {
    Set-Content -Path $localProps -Value "sdk.dir=$($sdkDir.Replace('\', '/'))"
}

# Set JAVA_HOME
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot"
$env:Path = "$jdkBin;" + $env:Path

Write-Host "Ready to assemble Android APK using Gradle in $twaDir."
Write-Host "Keystore password: $KeystorePass"
Write-Host "Signed APK will be placed in android-twa\app\build\outputs\apk\release\"
