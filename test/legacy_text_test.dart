import 'package:flutter_test/flutter_test.dart';
import 'package:zhixu/core/legacy_text.dart';

void main() {
  test('修复番茄旧版 UTF-16LE 乱码并保留 ASCII', () {
    expect(repairLegacyTomatoText('w\u008dŠ^'), '起床');
    expect(repairLegacyTomatoText('w聧艩^'), '起床');
    expect(repairLegacyTomatoText('ò]Œ[\u0010b'), '已完成');
    expect(repairLegacyTomatoText('貌]艗[\u0010b'), '已完成');
    expect(repairLegacyTomatoText('\u0013Nèlöeô•'), '专注时间');
    expect(repairLegacyTomatoText('vibe coding'), 'vibe coding');
  });

  test('任务状态和生活事件分类采用明确规则', () {
    expect(mapImportedTaskStatus('已完成'), 'done');
    expect(mapImportedTaskStatus('completed'), 'done');
    expect(mapImportedTaskStatus('未完成'), 'todo');
    expect(classifyLifeEvent('睡觉'), 'sleep');
    expect(classifyLifeEvent('醒来'), 'wake');
    expect(classifyLifeEvent('喝水'), 'other');
  });

  test('Dart 与 Rust 使用相同的番茄去重键规则', () {
    expect(
      tomatoSourceKey(
        DateTime(2026, 8, 7, 10, 30),
        DateTime(2026, 8, 7, 10, 30),
        '起床',
      ),
      'a1be8bc6ea057123662d796549beebfd3b37e169ab50a67c444f70a591705c1e',
    );
  });
}
