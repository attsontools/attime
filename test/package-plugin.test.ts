import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  buildPluginPackage,
  createArchive,
  createPluginManifest,
  loadPublisherSigningConfig,
  verifyPluginPackage
} from '../scripts/package-plugin.mjs';

describe('plugin package archive', () => {
  it('pins the Plugin SDK to the published release tag', async () => {
    const packageJson = JSON.parse(
      await readFile(path.resolve(import.meta.dirname, '..', 'package.json'), 'utf8')
    );
    assert.equal(
      packageJson.dependencies['@attson/plugin-sdk'],
      'github:attsontools/attool-plugin-sdk#v0.1.0-alpha.0'
    );
  });

  it('requires a valid Ed25519 publisher signing configuration', () => {
    assert.throws(
      () => loadPublisherSigningConfig({}),
      /ATTIME_PUBLISHER_KEY_ID is required/
    );

    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const publicKeyBase64 = Buffer.from(
      publicKey.export({ format: 'jwk' }).x,
      'base64url'
    ).toString('base64');
    assert.throws(
      () => loadPublisherSigningConfig({
        ATTIME_PUBLISHER_KEY_ID: 'attson-time-2026-01',
        ATTIME_PUBLISHER_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
      }),
      /ATTIME_PUBLISHER_PUBLIC_KEY is required/
    );
    const config = loadPublisherSigningConfig({
      ATTIME_PUBLISHER_KEY_ID: 'attson-time-2026-01',
      ATTIME_PUBLISHER_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      ATTIME_PUBLISHER_PUBLIC_KEY: publicKeyBase64
    });
    assert.equal(config.keyId, 'attson-time-2026-01');
    assert.deepEqual(createPublicKey(config.privateKey).export({ format: 'jwk' }), publicKey.export({ format: 'jwk' }));

    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    assert.throws(
      () => loadPublisherSigningConfig({
        ATTIME_PUBLISHER_KEY_ID: 'attson-time-2026-01',
        ATTIME_PUBLISHER_PRIVATE_KEY: rsa.export({ type: 'pkcs8', format: 'pem' }).toString(),
        ATTIME_PUBLISHER_PUBLIC_KEY: publicKeyBase64
      }),
      /must be an Ed25519 private key/
    );

    const unrelated = generateKeyPairSync('ed25519');
    assert.throws(
      () => loadPublisherSigningConfig({
        ATTIME_PUBLISHER_KEY_ID: 'attson-time-2026-01',
        ATTIME_PUBLISHER_PRIVATE_KEY: unrelated.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        ATTIME_PUBLISHER_PUBLIC_KEY: publicKeyBase64
      }),
      /does not match ATTIME_PUBLISHER_PUBLIC_KEY/
    );
  });

  it('uses the platform application name in the manifest', () => {
    const manifest = createPluginManifest('0.1.0', 'linux', 'x86_64', {
      'ui/index.html': 'a'.repeat(64)
    }, 'attson-time-2026-01');

    assert.equal(manifest.appId, 'com.attson.time');
    assert.equal(manifest.name, '时间工具');
    assert.deepEqual(manifest.permissions, ['host.theme.read']);
  });

  it('uses the publisher key selected for the release', () => {
    const manifest = createPluginManifest('0.1.0', 'linux', 'x86_64', {
      'ui/index.html': 'a'.repeat(64)
    }, 'attson-time-2026-01');

    assert.equal(manifest.publisher.keyId, 'attson-time-2026-01');
  });

  it('contains declared files without directory entries', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'attime-package-'));
    const stage = path.join(root, 'stage');
    const output = path.join(root, 'time.atpkg');
    await mkdir(path.join(stage, 'ui', 'assets'), { recursive: true });
    await writeFile(path.join(stage, 'manifest.json'), '{}');
    await writeFile(path.join(stage, 'ui', 'assets', 'app.js'), 'export {};');

    await createArchive(stage, output);

    const entries = execFileSync('unzip', ['-Z', '-1', output], { encoding: 'utf8' })
      .trim()
      .split('\n');
    assert.deepEqual(entries.sort(), ['manifest.json', 'ui/assets/app.js']);
  });

  it('builds and re-verifies a release package before publishing', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'attime-release-'));
    await mkdir(path.join(root, 'dist-plugin'), { recursive: true });
    await writeFile(path.join(root, 'dist-plugin', 'index.html'), '<main>time</main>');
    await writeFile(path.join(root, 'LICENSE'), 'test license');
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const expected = {
      version: '1.2.3',
      targetOs: 'linux',
      targetArch: 'x86_64',
      publisherKeyId: 'attson-time-2026-01'
    } as const;

    const packagePath = await buildPluginPackage({
      root,
      ...expected,
      signing: { keyId: expected.publisherKeyId, privateKey }
    });
    assert.equal(path.basename(packagePath), 'AT.Time_1.2.3_linux_x86_64.atpkg');
    const manifest = await verifyPluginPackage(packagePath, publicKey, expected);
    assert.equal(manifest.publisher.keyId, expected.publisherKeyId);
    assert.equal(
      manifest.files['ui/index.html'],
      createHash('sha256')
        .update(await readFile(path.join(root, 'dist-plugin', 'index.html')))
        .digest('hex')
    );

    const extracted = path.join(root, 'tampered');
    execFileSync('unzip', ['-q', packagePath, '-d', extracted]);
    await writeFile(path.join(extracted, 'ui', 'index.html'), '<main>tampered</main>');
    const tamperedPackage = path.join(root, 'AT.Time_1.2.3_linux_x86_64.atpkg');
    await createArchive(extracted, tamperedPackage);
    await assert.rejects(
      verifyPluginPackage(tamperedPackage, publicKey, expected),
      /hash mismatch for ui\/index.html/
    );
  });
});
