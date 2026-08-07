import 'dart:convert';
import 'dart:io';

import 'package:archive/archive.dart';
import 'package:file_picker/file_picker.dart';

import '../data/repository.dart';

class BackupService {
  BackupService(this.repository);

  final ZhixuRepository repository;

  Future<File?> exportBackup() async {
    final path = await FilePicker.saveFile(
      dialogTitle: '导出知序备份',
      fileName:
          'zhixu-backup-${DateTime.now().toIso8601String().substring(0, 10)}.zip',
      type: FileType.custom,
      allowedExtensions: ['zip'],
    );
    if (path == null) return null;
    final archive = Archive();
    final content = utf8.encode(jsonEncode(await repository.exportPayload()));
    archive.addFile(ArchiveFile('manifest.json', content.length, content));
    final bytes = ZipEncoder().encode(archive);
    final file = File(path);
    await file.writeAsBytes(bytes, flush: true);
    return file;
  }

  Future<void> restoreBackup(File file) async {
    final archive = ZipDecoder().decodeBytes(await file.readAsBytes());
    final entry = archive.findFile('manifest.json');
    if (entry == null) throw StateError('备份中缺少 manifest.json');
    final raw = jsonDecode(utf8.decode(entry.content as List<int>));
    if (raw is! Map || raw['schema_version'] != 1) throw StateError('不支持的备份版本');
    await repository.restorePayload(Map<String, dynamic>.from(raw));
  }
}
