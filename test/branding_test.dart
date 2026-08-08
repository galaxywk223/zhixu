import 'dart:io';
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('品牌资产保留来源许可并生成透明多尺寸 Windows 图标', () async {
    final source = File(
      'assets/branding/fluent-flow-24-filled.svg',
    ).readAsStringSync();
    final notices = File('THIRD_PARTY_NOTICES.md').readAsStringSync();
    final license = File(
      'assets/branding/FLUENT_SYSTEM_ICONS_LICENSE.txt',
    ).readAsStringSync();
    expect(source, contains('M14.0802 8.80069'));
    expect(notices, contains('0a92ff83f03fa5319edaf0e2b2a09e460b69091a'));
    expect(license, contains('Copyright (c) 2020 Microsoft Corporation'));

    final pngBytes = File(
      'assets/branding/zhixu-mark-1024.png',
    ).readAsBytesSync();
    final codec = await instantiateImageCodec(pngBytes);
    final image = (await codec.getNextFrame()).image;
    expect((image.width, image.height), (1024, 1024));
    final rgba = await image.toByteData(format: ImageByteFormat.rawRgba);
    expect(rgba, isNotNull);
    expect(rgba!.getUint8(3), 0);
    final centerAlphaOffset = ((512 * 1024) + 512) * 4 + 3;
    expect(rgba.getUint8(centerAlphaOffset), 255);

    final ico = File('windows/runner/resources/app_icon.ico').readAsBytesSync();
    final count = ico[4] | (ico[5] << 8);
    expect(count, 4);
    final sizes = <int>[];
    for (var index = 0; index < count; index++) {
      final width = ico[6 + index * 16];
      sizes.add(width == 0 ? 256 : width);
    }
    expect(sizes, [256, 48, 32, 16]);
    expect(File('assets/tray/zhixu.ico').readAsBytesSync(), orderedEquals(ico));
  });
}
