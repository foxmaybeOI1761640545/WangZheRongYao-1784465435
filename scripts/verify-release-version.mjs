import { readFile } from 'node:fs/promises'

const versionPattern = /^[0-9]+\.0\.[0-9]+$/
const tagPattern = /^v[0-9]+\.0\.[0-9]+$/
const maxAndroidInt = 2147483647

function fail(message) {
  console.error(`version verification failed: ${message}`)
  process.exit(1)
}

const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
const packageLock = JSON.parse(await readFile('package-lock.json', 'utf8'))
const version = packageJson.version

if (!versionPattern.test(version)) fail(`package.json version must match X.0.Y, actual: ${version}`)
if (packageLock.version !== version) fail(`package-lock.json top-level version mismatch: ${packageLock.version} !== ${version}`)
if (packageLock.packages?.['']?.version !== version) fail(`package-lock packages[""] version mismatch: ${packageLock.packages?.['']?.version} !== ${version}`)

const [major, , patch] = version.split('.').map(Number)
const versionCode = major * 1000000 + patch
if (!Number.isSafeInteger(versionCode) || versionCode <= 0 || versionCode > maxAndroidInt) {
  fail(`versionCode out of Android int range: ${versionCode}`)
}

const releaseTag = process.env.RELEASE_TAG
if (releaseTag) {
  if (!tagPattern.test(releaseTag)) fail(`RELEASE_TAG must match vX.0.Y, actual: ${releaseTag}`)
  if (releaseTag.slice(1) !== version) fail(`RELEASE_TAG ${releaseTag} does not match package.json version ${version}`)
}

console.log(`version=${version}`)
console.log(`android_version_code=${versionCode}`)
