import 'dart:convert';

import 'package:crypto/crypto.dart';

String normalizeImportedTitle(String value) => value
    .trim()
    .split(RegExp(r'\s+'))
    .where((part) => part.isNotEmpty)
    .join(' ')
    .toLowerCase();

String _tomatoStamp(DateTime value) {
  final local = value.toLocal();
  String two(int part) => part.toString().padLeft(2, '0');
  return '${local.year}-${two(local.month)}-${two(local.day)} '
      '${two(local.hour)}:${two(local.minute)}';
}

String tomatoSourceKey(DateTime startAt, DateTime endAt) {
  final stable = 'tomatodo|${_tomatoStamp(startAt)}|${_tomatoStamp(endAt)}';
  return 'v3:${sha256.convert(utf8.encode(stable))}';
}

String legacyTomatoSourceKey(
  DateTime startAt,
  DateTime endAt,
  String taskName,
) {
  final stable =
      'tomatodo|${_tomatoStamp(startAt)}|${_tomatoStamp(endAt)}|${normalizeImportedTitle(taskName)}';
  return sha256.convert(utf8.encode(stable)).toString();
}

String importedTaskKey(String title) => sha256
    .convert(utf8.encode('tomatodo-task|${normalizeImportedTitle(title)}'))
    .toString();

String repairLegacyTomatoText(String value) {
  var source = value
      .replaceAll('聧', '\u008d')
      .replaceAll('艩', 'Š')
      .replaceAll('貌', 'ò')
      .replaceAll('艗', 'Œ');
  if (source.isEmpty ||
      source.codeUnits.every((unit) => unit >= 0x20 && unit <= 0x7f)) {
    return source;
  }
  if (source.runes.where((rune) => rune >= 0x30 && rune <= 0x39).length >= 8) {
    final parts = source.split(RegExp(r'\s+'));
    if (parts.length > 1) {
      return parts.map(repairLegacyTomatoText).join(' ');
    }
  }
  final whole = _decodeLegacySpan(source);
  if (whole != null) return whole.trim();

  final result = StringBuffer();
  final span = StringBuffer();
  void flushSpan() {
    final value = span.toString();
    if (value.isEmpty) return;
    result.write(_decodeLegacySpan(value) ?? value);
    span.clear();
  }

  for (final rune in source.runes) {
    if (_cp1252Byte(rune) != null) {
      span.writeCharCode(rune);
    } else {
      flushSpan();
      result.writeCharCode(rune);
    }
  }
  flushSpan();
  return result.toString().replaceAll('\u0000', '').trim();
}

String? _decodeLegacySpan(String source) {
  if (source.isEmpty) return null;
  final bytes = <int>[];
  for (final rune in source.runes) {
    final byte = _cp1252Byte(rune);
    if (byte == null) return null;
    bytes.add(byte);
  }
  if (bytes.length.isOdd) return null;
  final units = <int>[];
  for (var index = 0; index < bytes.length; index += 2) {
    units.add(bytes[index] | (bytes[index + 1] << 8));
  }
  final candidate = String.fromCharCodes(units).replaceAll('\u0000', '').trim();
  final hasCjk = candidate.runes.any(
    (rune) =>
        (rune >= 0x3400 && rune <= 0x9fff) ||
        (rune >= 0xf900 && rune <= 0xfaff),
  );
  final hasMarker = source.runes.any(
    (rune) => rune < 0x20 || (rune >= 0x7f && rune <= 0x9f) || rune > 0xff,
  );
  return hasCjk && hasMarker ? candidate : null;
}

int? _cp1252Byte(int rune) {
  const mapped = <int, int>{
    0x20ac: 0x80,
    0x201a: 0x82,
    0x0192: 0x83,
    0x201e: 0x84,
    0x2026: 0x85,
    0x2020: 0x86,
    0x2021: 0x87,
    0x02c6: 0x88,
    0x2030: 0x89,
    0x0160: 0x8a,
    0x2039: 0x8b,
    0x0152: 0x8c,
    0x017d: 0x8e,
    0x2018: 0x91,
    0x2019: 0x92,
    0x201c: 0x93,
    0x201d: 0x94,
    0x2022: 0x95,
    0x2013: 0x96,
    0x2014: 0x97,
    0x02dc: 0x98,
    0x2122: 0x99,
    0x0161: 0x9a,
    0x203a: 0x9b,
    0x0153: 0x9c,
    0x017e: 0x9e,
    0x0178: 0x9f,
  };
  if (mapped.containsKey(rune)) return mapped[rune];
  return rune <= 0xff ? rune : null;
}

String classifyLifeEvent(String title) {
  final normalized = normalizeImportedTitle(title);
  if (const {'睡觉', '入睡', '上床睡觉'}.contains(normalized)) {
    return 'sleep';
  }
  if (const {'起床', '醒来', '起床了'}.contains(normalized)) {
    return 'wake';
  }
  return 'other';
}

String mapImportedTaskStatus(String status) {
  final normalized = normalizeImportedTitle(status);
  return const {'已完成', 'completed', 'done'}.contains(normalized)
      ? 'done'
      : 'todo';
}
