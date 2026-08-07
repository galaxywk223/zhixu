import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:file_picker/file_picker.dart';
import 'package:path/path.dart' as p;

import '../data/repository.dart';

class TomatoImportData {
  TomatoImportData({required this.raw, required this.filePath});

  final Map<String, dynamic> raw;
  final String filePath;

  String get fileHash => raw['file_hash'] as String? ?? '';
  String? get exportUser => raw['export_user'] as String?;
  int? get declaredMinutes => raw['declared_minutes'] as int?;
  int? get declaredRecords => raw['declared_records'] as int?;
  DateTime? get rangeStart => _parseLocal(raw['range_start'] as String?);
  DateTime? get rangeEnd => _parseLocal(raw['range_end'] as String?);

  List<ImportedFocusSession> get sessions =>
      (raw['sessions'] as List? ?? const []).map((item) {
        final row = item as Map<String, dynamic>;
        return ImportedFocusSession(
          sourceKey: row['source_key'] as String,
          legacySourceKey: row['legacy_source_key'] as String?,
          startAt: _parseLocal(row['start_local'] as String) ?? DateTime.now(),
          endAt: _parseLocal(row['end_local'] as String) ?? DateTime.now(),
          taskName: row['task_name'] as String? ?? '',
          durationMinutes: row['duration_minutes'] as int? ?? 0,
          reflection: row['reflection'] as String?,
          status: row['status'] as String? ?? '',
        );
      }).toList();

  static DateTime? _parseLocal(String? value) =>
      value == null || value.isEmpty ? null : DateTime.tryParse(value);
}

class TomatoImportService {
  Future<TomatoImportData?> pickAndPreview() async {
    final result = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['xls'],
      withData: false,
    );
    final path = result?.files.single.path;
    if (path == null) return null;
    return preview(File(path));
  }

  Future<TomatoImportData> preview(File file) async {
    if (!await file.exists()) throw StateError('文件不存在');
    final executable = await _findExecutable();
    if (executable == null) {
      throw StateError('未找到番茄 TODO 解析器，请先运行 tool/build_native.ps1');
    }
    final process = await Process.run(
      executable,
      [file.path],
      stdoutEncoding: utf8,
      stderrEncoding: utf8,
    );
    if (process.exitCode != 0) {
      throw StateError(
        (process.stderr as String).trim().isEmpty
            ? '解析失败'
            : process.stderr.toString().trim(),
      );
    }
    final raw = jsonDecode(process.stdout as String) as Map<String, dynamic>;
    if (raw['schema_version'] != 2 || raw['source'] != 'tomatodo') {
      throw StateError('不支持的番茄 TODO 解析结果');
    }
    return TomatoImportData(raw: raw, filePath: file.path);
  }

  Future<ImportResult> confirm(
    ZhixuRepository repository,
    TomatoImportData data,
  ) async {
    final bytes = await File(data.filePath).readAsBytes();
    final hash = sha256.convert(bytes).toString();
    return repository.importFocusSessions(
      fileName: p.basename(data.filePath),
      fileHash: hash,
      sessions: data.sessions,
      exportUser: data.exportUser,
      rangeStart: data.rangeStart,
      rangeEnd: data.rangeEnd,
      declaredMinutes: data.declaredMinutes,
      declaredRecords: data.declaredRecords,
    );
  }

  Future<String?> _findExecutable() async {
    final candidates = <String>[
      p.join(
        Directory.current.path,
        'native',
        'tomatodo_importer',
        'target',
        'release',
        Platform.isWindows
            ? 'zhixu_tomatodo_importer.exe'
            : 'zhixu_tomatodo_importer',
      ),
      p.join(
        Directory.current.path,
        'native',
        'tomatodo_importer',
        'target',
        'debug',
        Platform.isWindows
            ? 'zhixu_tomatodo_importer.exe'
            : 'zhixu_tomatodo_importer',
      ),
    ];
    if (Platform.isWindows) {
      final exeDir = Directory(p.dirname(Platform.resolvedExecutable));
      candidates.add(
        p.join(
          exeDir.path,
          'data',
          'flutter_assets',
          'assets',
          'native',
          'zhixu_tomatodo_importer.exe',
        ),
      );
    }
    for (final path in candidates) {
      if (await File(path).exists()) return path;
    }
    return null;
  }
}
