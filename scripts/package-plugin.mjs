import { createHash, createPrivateKey, createPublicKey } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { parseManifest } from '@attson/plugin-sdk';
import { signManifest, verifyManifestSignature } from '@attson/plugin-sdk/node';

export function loadPublisherSigningConfig(env) {
  const keyId = env.ATTIME_PUBLISHER_KEY_ID?.trim();
  if (!keyId) throw new Error('ATTIME_PUBLISHER_KEY_ID is required');
  const encodedKey = env.ATTIME_PUBLISHER_PRIVATE_KEY?.trim();
  if (!encodedKey) throw new Error('ATTIME_PUBLISHER_PRIVATE_KEY is required');
  const encodedPublicKey = env.ATTIME_PUBLISHER_PUBLIC_KEY?.trim();
  if (!encodedPublicKey) throw new Error('ATTIME_PUBLISHER_PUBLIC_KEY is required');
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encodedPublicKey)) {
    throw new Error('ATTIME_PUBLISHER_PUBLIC_KEY must be a raw Ed25519 public key');
  }

  let privateKey;
  try {
    privateKey = createPrivateKey(encodedKey);
  } catch {
    throw new Error('ATTIME_PUBLISHER_PRIVATE_KEY must be an Ed25519 private key');
  }
  if (privateKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('ATTIME_PUBLISHER_PRIVATE_KEY must be an Ed25519 private key');
  }
  const derivedPublicKey = createPublicKey(privateKey).export({ format: 'jwk' });
  const derivedPublicKeyBase64 = Buffer.from(derivedPublicKey.x, 'base64url').toString('base64');
  if (derivedPublicKeyBase64 !== encodedPublicKey) {
    throw new Error('ATTIME_PUBLISHER_PRIVATE_KEY does not match ATTIME_PUBLISHER_PUBLIC_KEY');
  }
  return { keyId, privateKey };
}

export async function createArchive(stage, output) {
  const entries = await collect(stage);
  const command = process.platform === 'win32' ? '7z' : 'zip';
  const args = process.platform === 'win32'
    ? ['a', '-tzip', '-mx=9', output, ...entries]
    : ['-X', '-D', '-q', output, ...entries];
  const zipped = spawnSync(command, args, {
    cwd: stage,
    stdio: 'inherit'
  });
  if (zipped.status !== 0) throw new Error(`${command} failed`);
}

export function createPluginManifest(version, targetOs, targetArch, files, publisherKeyId) {
  return parseManifest({
    schemaVersion: 1,
    appId: 'com.attson.time',
    name: '时间工具',
    version,
    publisher: { id: 'com.attson', name: 'Attson', keyId: publisherKeyId },
    target: { os: targetOs, arch: targetArch },
    hostApi: { min: '1.0.0', max: '1.x' },
    ui: { entry: 'ui/index.html' },
    permissions: ['host.theme.read'],
    files
  });
}

export async function buildPluginPackage({
  root,
  version,
  targetOs,
  targetArch,
  publisherKeyId,
  signing
}) {
  if (publisherKeyId !== signing.keyId) {
    throw new Error('Publisher Key ID does not match signing configuration');
  }
  const stage = path.join(root, '.plugin-stage');
  const ui = path.join(stage, 'ui');
  const artifacts = path.join(root, 'artifacts');
  const output = path.join(
    artifacts,
    `AT.Time_${version}_${targetOs}_${targetArch}.atpkg`
  );
  await rm(stage, { recursive: true, force: true });
  await rm(output, { force: true });

  try {
    await mkdir(ui, { recursive: true });
    await mkdir(artifacts, { recursive: true });
    await cp(path.join(root, 'dist-plugin'), ui, { recursive: true });
    await cp(path.join(root, 'LICENSE'), path.join(stage, 'LICENSE'));

    const files = {};
    for (const relative of await collect(stage)) {
      if (relative === 'manifest.json' || relative === 'manifest.sig') continue;
      files[relative] = sha256(await readFile(path.join(stage, relative)));
    }
    const manifest = createPluginManifest(
      version,
      targetOs,
      targetArch,
      files,
      publisherKeyId
    );
    await writeFile(path.join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(
      path.join(stage, 'manifest.sig'),
      `${signManifest(manifest, signing.privateKey)}\n`
    );
    await createArchive(stage, output);
    await verifyPluginPackage(output, createPublicKey(signing.privateKey), {
      version,
      targetOs,
      targetArch,
      publisherKeyId
    });
    return output;
  } catch (error) {
    await rm(output, { force: true });
    throw error;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

export async function verifyPluginPackage(packagePath, publicKey, expected) {
  const expectedName =
    `AT.Time_${expected.version}_${expected.targetOs}_${expected.targetArch}.atpkg`;
  if (path.basename(packagePath) !== expectedName) {
    throw new Error(`Package file name must be ${expectedName}`);
  }

  const extracted = await mkdtemp(path.join(tmpdir(), 'attime-verify-'));
  try {
    extractArchive(packagePath, extracted);
    const manifest = parseManifest(
      JSON.parse(await readFile(path.join(extracted, 'manifest.json'), 'utf8'))
    );
    const signature = (await readFile(path.join(extracted, 'manifest.sig'), 'utf8')).trim();
    if (!verifyManifestSignature(manifest, signature, publicKey)) {
      throw new Error('Plugin manifest signature is invalid');
    }
    requireEqual(manifest.appId, 'com.attson.time', 'app ID');
    requireEqual(manifest.version, expected.version, 'version');
    requireEqual(manifest.publisher.keyId, expected.publisherKeyId, 'Publisher Key ID');
    requireEqual(manifest.target.os, expected.targetOs, 'target OS');
    requireEqual(manifest.target.arch, expected.targetArch, 'target architecture');

    const actualFiles = (await collect(extracted))
      .filter((relative) => relative !== 'manifest.json' && relative !== 'manifest.sig');
    const declaredFiles = Object.keys(manifest.files).sort();
    if (JSON.stringify(actualFiles) !== JSON.stringify(declaredFiles)) {
      throw new Error('Package files do not match the manifest');
    }
    for (const relative of declaredFiles) {
      const actualHash = sha256(await readFile(path.join(extracted, relative)));
      if (actualHash !== manifest.files[relative]) {
        throw new Error(`Package hash mismatch for ${relative}`);
      }
    }
    return manifest;
  } finally {
    await rm(extracted, { recursive: true, force: true });
  }
}

async function main() {
  const root = path.resolve(import.meta.dirname, '..');
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const targetOs = { darwin: 'macos', win32: 'windows', linux: 'linux' }[process.platform];
  const targetArch = { arm64: 'aarch64', x64: 'x86_64' }[process.arch];
  if (!targetOs || !targetArch) throw new Error(`Unsupported target: ${process.platform}/${process.arch}`);
  const signing = loadPublisherSigningConfig(process.env);
  const output = await buildPluginPackage({
    root,
    version: packageJson.version,
    targetOs,
    targetArch,
    publisherKeyId: signing.keyId,
    signing
  });
  console.log(output);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

async function collect(directory, prefix = '') {
  const output = [];
  for (const entry of await readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) output.push(...await collect(directory, relative));
    else output.push(relative);
  }
  return output.sort();
}

function extractArchive(packagePath, destination) {
  const command = process.platform === 'win32' ? '7z' : 'unzip';
  const args = process.platform === 'win32'
    ? ['x', '-y', `-o${destination}`, packagePath]
    : ['-q', packagePath, '-d', destination];
  const extracted = spawnSync(command, args, { stdio: 'inherit' });
  if (extracted.status !== 0) throw new Error(`${command} failed`);
}

function requireEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`Package ${label} mismatch: expected ${expected}, received ${actual}`);
  }
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}
