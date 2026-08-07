import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:zhixu/services/update_service.dart';

void main() {
  const releaseUrl = 'https://github.com/galaxywk223/zhixu/releases/tag/v0.2.0';
  const downloadUrl =
      'https://github.com/galaxywk223/zhixu/releases/download/v0.2.0/Zhixu-Setup-0.2.0.exe';

  test('semantic versions compare independently of v prefix and build', () {
    expect(compareSemanticVersions('v0.2.0', '0.1.9'), greaterThan(0));
    expect(compareSemanticVersions('0.1.0+9', 'v0.1.0+1'), 0);
    expect(compareSemanticVersions('0.1.0', '0.1.1'), lessThan(0));
  });

  test(
    'manifest parser validates schema, repository URLs and asset metadata',
    () {
      final manifest = _manifest();
      final parsed = parseUpdateManifest(manifest, expectedVersion: '0.2.0');
      expect(parsed.version, '0.2.0');
      expect(parsed.fileName, 'Zhixu-Setup-0.2.0.exe');

      expect(
        () => parseUpdateManifest(
          manifest.replaceFirst('schemaVersion":1', 'schemaVersion":2'),
          expectedVersion: '0.2.0',
        ),
        throwsFormatException,
      );
      expect(
        () => parseUpdateManifest(
          manifest.replaceFirst('galaxywk223/zhixu', 'other/repo'),
          expectedVersion: '0.2.0',
        ),
        throwsFormatException,
      );
      expect(
        () => parseUpdateManifest(
          manifest.replaceFirst('Zhixu-Setup-0.2.0.exe', 'other.exe'),
          expectedVersion: '0.2.0',
        ),
        throwsFormatException,
      );
    },
  );

  test(
    'release lookup ignores drafts and selects the newest prerelease',
    () async {
      final client = MockClient((request) async {
        if (request.url.path.endsWith('/releases')) {
          return http.Response(
            jsonEncode([
              {'tag_name': 'v0.4.0', 'draft': true, 'assets': []},
              {
                'tag_name': 'v0.2.0',
                'draft': false,
                'prerelease': true,
                'assets': [
                  {
                    'name': 'update-manifest.json',
                    'browser_download_url':
                        'https://github.com/galaxywk223/zhixu/releases/download/v0.2.0/update-manifest.json',
                  },
                ],
              },
            ]),
            200,
          );
        }
        return http.Response(_manifest(), 200);
      });
      final service = UpdateService(
        clientFactory: () => client,
        versionLoader: () async => '0.1.0',
        lastCheckLoader: () async => null,
        lastCheckSaver: (_) async {},
      );

      await service.checkForUpdate();

      expect(service.status, UpdateStatus.available);
      expect(service.availableRelease?.version, '0.2.0');
      service.dispose();
    },
  );

  test(
    'auto check respects the 24 hour cooldown and reports no update',
    () async {
      var requests = 0;
      final service = UpdateService(
        clientFactory: () => MockClient((request) async {
          requests++;
          return http.Response(jsonEncode(<dynamic>[]), 200);
        }),
        versionLoader: () async => '0.1.0',
        lastCheckLoader: () async => DateTime(2026, 8, 7, 10),
        lastCheckSaver: (_) async {},
        clock: () => DateTime(2026, 8, 7, 12),
      );

      await service.autoCheck();
      expect(requests, 0);
      expect(service.currentVersion, '0.1.0');
      await service.checkForUpdate();
      expect(requests, 1);
      expect(service.status, UpdateStatus.upToDate);
      service.dispose();
    },
  );

  test(
    'download verifies size and SHA-256, then launches and exits in order',
    () async {
      final bytes = utf8.encode('installer bytes');
      final digest = sha256.convert(bytes).toString();
      final tempDirectory = await Directory.systemTemp.createTemp(
        'zhixu-update-',
      );
      final events = <String>[];
      final service =
          UpdateService(
              clientFactory: () => MockClient((request) async {
                events.add('download');
                return http.Response.bytes(bytes, 200);
              }),
              temporaryDirectoryLoader: () async => tempDirectory,
              installerLauncher: (path) async {
                events.add('launch');
                expect(File(path).existsSync(), isTrue);
              },
              delay: (_) async => events.add('delay'),
              exitApplication: () async => events.add('exit'),
            )
            ..availableRelease = UpdateRelease(
              version: '0.2.0',
              notes: '',
              releaseUrl: Uri.parse(releaseUrl),
              downloadUrl: Uri.parse(downloadUrl),
              fileName: 'Zhixu-Setup-0.2.0.exe',
              sha256Digest: digest,
              size: bytes.length,
            );

      await service.downloadAndInstall();

      expect(events, ['download', 'launch', 'delay', 'exit']);
      expect(service.downloadProgress, 1);
      await tempDirectory.delete(recursive: true);
      service.dispose();
    },
  );

  test('download removes a package when SHA-256 does not match', () async {
    final tempDirectory = await Directory.systemTemp.createTemp(
      'zhixu-update-',
    );
    final service =
        UpdateService(
            clientFactory: () => MockClient((request) async {
              return http.Response('bad', 200);
            }),
            temporaryDirectoryLoader: () async => tempDirectory,
            installerLauncher: (_) async => fail('安装器不应启动'),
          )
          ..availableRelease = UpdateRelease(
            version: '0.2.0',
            notes: '',
            releaseUrl: Uri.parse(releaseUrl),
            downloadUrl: Uri.parse(downloadUrl),
            fileName: 'Zhixu-Setup-0.2.0.exe',
            sha256Digest: List.filled(64, '0').join(),
            size: 3,
          );

    await service.downloadAndInstall();

    expect(service.status, UpdateStatus.error);
    expect(
      File(
        '${tempDirectory.path}${Platform.pathSeparator}Zhixu-Setup-0.2.0.exe',
      ).existsSync(),
      isFalse,
    );
    await tempDirectory.delete(recursive: true);
    service.dispose();
  });
}

String _manifest() => jsonEncode({
  'schemaVersion': 1,
  'version': '0.2.0',
  'notes': 'preview',
  'releaseUrl': 'https://github.com/galaxywk223/zhixu/releases/tag/v0.2.0',
  'assets': {
    'windows': {
      'fileName': 'Zhixu-Setup-0.2.0.exe',
      'downloadUrl':
          'https://github.com/galaxywk223/zhixu/releases/download/v0.2.0/Zhixu-Setup-0.2.0.exe',
      'sha256': List.filled(64, 'a').join(),
      'size': 123,
    },
  },
});
