import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/app_config.dart';

enum UpdateStatus { idle, checking, upToDate, available, downloading, error }

class UpdateRelease {
  const UpdateRelease({
    required this.version,
    required this.notes,
    required this.releaseUrl,
    required this.downloadUrl,
    required this.fileName,
    required this.sha256Digest,
    required this.size,
  });

  final String version;
  final String notes;
  final Uri releaseUrl;
  final Uri downloadUrl;
  final String fileName;
  final String sha256Digest;
  final int size;
}

class UpdateService extends ChangeNotifier {
  UpdateService({
    http.Client Function()? clientFactory,
    Future<String> Function()? versionLoader,
    Future<DateTime?> Function()? lastCheckLoader,
    Future<void> Function(DateTime value)? lastCheckSaver,
    Future<Directory> Function()? temporaryDirectoryLoader,
    Future<void> Function(String installerPath)? installerLauncher,
    Future<void> Function()? exitApplication,
    Future<void> Function(Duration duration)? delay,
    Future<bool> Function(Uri url)? externalUrlLauncher,
    DateTime Function()? clock,
    Uri? releasesApi,
  }) : _clientFactory = clientFactory ?? http.Client.new,
       _versionLoader = versionLoader ?? _loadCurrentVersion,
       _lastCheckLoader = lastCheckLoader ?? _loadLastCheck,
       _lastCheckSaver = lastCheckSaver ?? _saveLastCheck,
       _temporaryDirectoryLoader =
           temporaryDirectoryLoader ?? getTemporaryDirectory,
       _installerLauncher = installerLauncher ?? _launchInstaller,
       _exitApplication = exitApplication ?? _exitCurrentApplication,
       _delay = delay ?? Future<void>.delayed,
       _externalUrlLauncher = externalUrlLauncher ?? _launchExternalUrl,
       _clock = clock ?? DateTime.now,
       _releasesApi =
           releasesApi ??
           Uri.parse(
             'https://api.github.com/repos/${AppConfig.githubRepository}/releases?per_page=20',
           );

  static const _lastCheckKey = 'last_update_check_at';
  static const _checkInterval = Duration(hours: 24);
  static const _userAgent = 'Zhixu-Updater';

  final http.Client Function() _clientFactory;
  final Future<String> Function() _versionLoader;
  final Future<DateTime?> Function() _lastCheckLoader;
  final Future<void> Function(DateTime value) _lastCheckSaver;
  final Future<Directory> Function() _temporaryDirectoryLoader;
  final Future<void> Function(String installerPath) _installerLauncher;
  final Future<void> Function() _exitApplication;
  final Future<void> Function(Duration duration) _delay;
  final Future<bool> Function(Uri url) _externalUrlLauncher;
  final DateTime Function() _clock;
  final Uri _releasesApi;

  UpdateStatus status = UpdateStatus.idle;
  UpdateRelease? availableRelease;
  String? currentVersion;
  String? errorMessage;
  double downloadProgress = 0;

  bool get busy =>
      status == UpdateStatus.checking || status == UpdateStatus.downloading;

  Future<void> autoCheck() async {
    try {
      currentVersion ??= await _versionLoader();
      notifyListeners();
    } catch (error) {
      status = UpdateStatus.error;
      errorMessage = _friendlyError(error);
      notifyListeners();
      return;
    }
    final lastCheck = await _lastCheckLoader();
    if (lastCheck != null && _clock().difference(lastCheck) < _checkInterval) {
      return;
    }
    await checkForUpdate();
  }

  Future<void> checkForUpdate() async {
    if (busy) return;
    status = UpdateStatus.checking;
    errorMessage = null;
    notifyListeners();
    final client = _clientFactory();
    try {
      currentVersion ??= await _versionLoader();
      availableRelease = await _findAvailableRelease(client, currentVersion!);
      status = availableRelease == null
          ? UpdateStatus.upToDate
          : UpdateStatus.available;
      await _lastCheckSaver(_clock());
    } catch (error) {
      status = UpdateStatus.error;
      errorMessage = _friendlyError(error);
    } finally {
      client.close();
      notifyListeners();
    }
  }

  Future<UpdateRelease?> _findAvailableRelease(
    http.Client client,
    String installedVersion,
  ) async {
    final response = await client.get(
      _releasesApi,
      headers: const {
        'Accept': 'application/vnd.github+json',
        'User-Agent': _userAgent,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    );
    if (response.statusCode != HttpStatus.ok) {
      throw HttpException('GitHub Releases API 返回 HTTP ${response.statusCode}');
    }
    final decoded = jsonDecode(utf8.decode(response.bodyBytes));
    if (decoded is! List) throw const FormatException('发布列表格式无效');

    final candidates =
        decoded
            .whereType<Map<String, dynamic>>()
            .where((release) => release['draft'] != true)
            .where((release) {
              final tag = release['tag_name'];
              return tag is String && _isSemanticVersion(tag);
            })
            .toList()
          ..sort((left, right) {
            final leftVersion = left['tag_name'] as String;
            final rightVersion = right['tag_name'] as String;
            return compareSemanticVersions(rightVersion, leftVersion);
          });

    final candidate = candidates.cast<Map<String, dynamic>?>().firstWhere(
      (release) =>
          release != null &&
          compareSemanticVersions(
                release['tag_name'] as String,
                installedVersion,
              ) >
              0,
      orElse: () => null,
    );
    if (candidate == null) return null;

    final version = normalizeVersion(candidate['tag_name'] as String);
    final assets = candidate['assets'];
    if (assets is! List) throw const FormatException('发布资产格式无效');
    final manifestAsset = assets
        .whereType<Map<String, dynamic>>()
        .cast<Map<String, dynamic>?>()
        .firstWhere(
          (asset) => asset?['name'] == 'update-manifest.json',
          orElse: () => null,
        );
    if (manifestAsset == null) {
      throw const FormatException('最新版本缺少 update-manifest.json');
    }
    final manifestUrl = Uri.tryParse(
      manifestAsset['browser_download_url'] as String? ?? '',
    );
    _validateGitHubDownloadUri(manifestUrl, version, 'update-manifest.json');
    final manifestResponse = await client.get(
      manifestUrl!,
      headers: const {'User-Agent': _userAgent},
    );
    if (manifestResponse.statusCode != HttpStatus.ok) {
      throw HttpException('更新清单返回 HTTP ${manifestResponse.statusCode}');
    }
    return parseUpdateManifest(
      utf8.decode(manifestResponse.bodyBytes),
      expectedVersion: version,
    );
  }

  Future<void> downloadAndInstall() async {
    final release = availableRelease;
    if (release == null || busy) return;
    status = UpdateStatus.downloading;
    downloadProgress = 0;
    errorMessage = null;
    notifyListeners();

    File? target;
    final client = _clientFactory();
    try {
      final directory = await _temporaryDirectoryLoader();
      target = File(
        '${directory.path}${Platform.pathSeparator}${release.fileName}',
      );
      if (await target.exists()) await target.delete();
      final request = http.Request('GET', release.downloadUrl)
        ..headers['User-Agent'] = _userAgent;
      final response = await client.send(request);
      if (response.statusCode != HttpStatus.ok) {
        throw HttpException('更新下载返回 HTTP ${response.statusCode}');
      }
      var received = 0;
      final sink = target.openWrite();
      try {
        await for (final chunk in response.stream) {
          sink.add(chunk);
          received += chunk.length;
          downloadProgress = release.size == 0
              ? 0
              : (received / release.size).clamp(0, 1);
          notifyListeners();
        }
      } finally {
        await sink.close();
      }
      if (await target.length() != release.size) {
        throw const FormatException('更新包大小校验失败');
      }
      final digest = await sha256.bind(target.openRead()).first;
      if (digest.toString().toLowerCase() != release.sha256Digest) {
        throw const FormatException('更新包 SHA-256 校验失败');
      }
      await _installerLauncher(target.path);
      await _delay(const Duration(milliseconds: 500));
      await _exitApplication();
    } catch (error) {
      if (target != null && await target.exists()) await target.delete();
      status = UpdateStatus.error;
      errorMessage = _friendlyError(error);
      notifyListeners();
    } finally {
      client.close();
    }
  }

  Future<void> openReleasePage() async {
    final release = availableRelease;
    if (release == null) return;
    if (!await _externalUrlLauncher(release.releaseUrl)) {
      status = UpdateStatus.error;
      errorMessage = '系统未能打开版本说明页面。';
      notifyListeners();
    }
  }
}

UpdateRelease parseUpdateManifest(
  String manifest, {
  required String expectedVersion,
}) {
  final decoded = jsonDecode(manifest);
  if (decoded is! Map<String, dynamic> || decoded['schemaVersion'] != 1) {
    throw const FormatException('更新清单版本无效');
  }
  final version = _requiredString(decoded, 'version');
  if (!_isSemanticVersion(version) ||
      normalizeVersion(version) != normalizeVersion(expectedVersion)) {
    throw const FormatException('更新版本号无效');
  }
  final normalized = normalizeVersion(version);
  final releaseUrl = _requiredHttpsUri(decoded, 'releaseUrl');
  _validateReleaseUri(releaseUrl, normalized);
  final assets = decoded['assets'];
  if (assets is! Map<String, dynamic>) {
    throw const FormatException('更新资产格式无效');
  }
  final windows = assets['windows'];
  if (windows is! Map<String, dynamic>) {
    throw const FormatException('更新清单缺少 Windows 资产');
  }
  final expectedFileName = 'Zhixu-Setup-$normalized.exe';
  final fileName = _requiredString(windows, 'fileName');
  if (fileName != expectedFileName) {
    throw const FormatException('更新安装包名称无效');
  }
  final downloadUrl = _requiredHttpsUri(windows, 'downloadUrl');
  _validateGitHubDownloadUri(downloadUrl, normalized, fileName);
  final digest = _requiredString(windows, 'sha256').toLowerCase();
  if (!RegExp(r'^[0-9a-f]{64}$').hasMatch(digest)) {
    throw const FormatException('更新安装包摘要无效');
  }
  final size = windows['size'];
  if (size is! int || size <= 0) {
    throw const FormatException('更新安装包大小无效');
  }
  final notes = decoded['notes'];
  if (notes != null && notes is! String) {
    throw const FormatException('更新说明格式无效');
  }
  return UpdateRelease(
    version: normalized,
    notes: (notes as String? ?? '').trim(),
    releaseUrl: releaseUrl,
    downloadUrl: downloadUrl,
    fileName: fileName,
    sha256Digest: digest,
    size: size,
  );
}

int compareSemanticVersions(String left, String right) {
  final leftParts = _versionParts(left);
  final rightParts = _versionParts(right);
  for (var index = 0; index < 3; index++) {
    final comparison = leftParts[index].compareTo(rightParts[index]);
    if (comparison != 0) return comparison;
  }
  return 0;
}

String normalizeVersion(String value) =>
    value.trim().replaceFirst(RegExp(r'^[vV]'), '').split('+').first;

List<int> _versionParts(String value) =>
    normalizeVersion(value).split('.').map(int.parse).toList(growable: false);

bool _isSemanticVersion(String value) =>
    RegExp(r'^[vV]?\d+\.\d+\.\d+$').hasMatch(value.trim());

String _requiredString(Map<String, dynamic> source, String key) {
  final value = source[key];
  if (value is! String || value.trim().isEmpty) {
    throw FormatException('更新清单字段 $key 无效');
  }
  return value.trim();
}

Uri _requiredHttpsUri(Map<String, dynamic> source, String key) {
  final uri = Uri.tryParse(_requiredString(source, key));
  if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) {
    throw FormatException('更新清单字段 $key 无效');
  }
  return uri;
}

void _validateReleaseUri(Uri uri, String version) {
  final expected = Uri.parse(
    'https://github.com/${AppConfig.githubRepository}/releases/tag/v$version',
  );
  if (uri != expected) throw const FormatException('更新页面地址无效');
}

void _validateGitHubDownloadUri(Uri? uri, String version, String fileName) {
  final expected = Uri.parse(
    'https://github.com/${AppConfig.githubRepository}/releases/download/v$version/$fileName',
  );
  if (uri != expected) throw const FormatException('更新下载地址无效');
}

String _friendlyError(Object error) {
  if (error is FormatException || error is TypeError) {
    return '更新信息校验失败，请稍后重试。';
  }
  if (error is SocketException ||
      error is TimeoutException ||
      error is http.ClientException) {
    return '无法连接更新服务，请检查网络后重试。';
  }
  return '更新检查失败：$error';
}

Future<String> _loadCurrentVersion() async =>
    (await PackageInfo.fromPlatform()).version;

Future<DateTime?> _loadLastCheck() async {
  final preferences = await SharedPreferences.getInstance();
  return DateTime.tryParse(
    preferences.getString(UpdateService._lastCheckKey) ?? '',
  );
}

Future<void> _saveLastCheck(DateTime value) async {
  final preferences = await SharedPreferences.getInstance();
  await preferences.setString(
    UpdateService._lastCheckKey,
    value.toIso8601String(),
  );
}

Future<void> _launchInstaller(String installerPath) async {
  await Process.start(installerPath, const [], mode: ProcessStartMode.detached);
}

Future<void> _exitCurrentApplication() async => exit(0);

Future<bool> _launchExternalUrl(Uri url) =>
    launchUrl(url, mode: LaunchMode.externalApplication);
