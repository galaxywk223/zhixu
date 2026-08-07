import 'package:flutter/material.dart';

class ZhixuColors {
  static const canvas = Color(0xFF080D14);
  static const surface = Color(0xFF101923);
  static const surfaceRaised = Color(0xFF162231);
  static const border = Color(0xFF263545);
  static const text = Color(0xFFE7EEF7);
  static const muted = Color(0xFF91A2B5);
  static const accent = Color(0xFF2F8BFF);
  static const accentSoft = Color(0xFF173D6E);
  static const success = Color(0xFF35C878);
  static const warning = Color(0xFFFFB547);
  static const danger = Color(0xFFFF5D64);
  static const purple = Color(0xFFA579FF);
  static const cyan = Color(0xFF36C8D8);
}

ThemeData buildZhixuTheme({required Brightness brightness}) {
  final dark = brightness == Brightness.dark;
  final scheme = ColorScheme.fromSeed(
    seedColor: ZhixuColors.accent,
    brightness: brightness,
    surface: dark ? ZhixuColors.surface : const Color(0xFFF5F7FA),
  );
  final base = ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    scaffoldBackgroundColor: dark
        ? ZhixuColors.canvas
        : const Color(0xFFF4F6F9),
    fontFamily: 'Segoe UI',
    visualDensity: VisualDensity.compact,
  );
  return base.copyWith(
    appBarTheme: AppBarTheme(
      backgroundColor: Colors.transparent,
      foregroundColor: dark ? ZhixuColors.text : const Color(0xFF18212B),
      elevation: 0,
      titleTextStyle: TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.w700,
        color: dark ? ZhixuColors.text : const Color(0xFF18212B),
      ),
    ),
    cardTheme: CardThemeData(
      color: dark ? ZhixuColors.surface : Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(
          color: dark ? ZhixuColors.border : const Color(0xFFD9E0E8),
        ),
      ),
    ),
    dividerTheme: DividerThemeData(
      color: dark ? ZhixuColors.border : const Color(0xFFE1E6EC),
      space: 1,
      thickness: 1,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: dark ? const Color(0xFF0D151F) : Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(6),
        borderSide: BorderSide(
          color: dark ? ZhixuColors.border : const Color(0xFFD9E0E8),
        ),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(6),
        borderSide: BorderSide(
          color: dark ? ZhixuColors.border : const Color(0xFFD9E0E8),
        ),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(6),
        borderSide: const BorderSide(color: ZhixuColors.accent, width: 1.4),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
    ),
    chipTheme: base.chipTheme.copyWith(
      side: BorderSide(
        color: dark ? ZhixuColors.border : const Color(0xFFD9E0E8),
      ),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(5)),
      padding: const EdgeInsets.symmetric(horizontal: 6),
      labelStyle: TextStyle(
        fontSize: 12,
        color: dark ? ZhixuColors.text : const Color(0xFF243242),
      ),
    ),
    navigationRailTheme: NavigationRailThemeData(
      backgroundColor: dark ? const Color(0xFF0A111A) : Colors.white,
      selectedIconTheme: const IconThemeData(color: ZhixuColors.accent),
      selectedLabelTextStyle: const TextStyle(
        color: ZhixuColors.accent,
        fontWeight: FontWeight.w700,
      ),
      unselectedIconTheme: IconThemeData(
        color: dark ? ZhixuColors.muted : const Color(0xFF68788A),
      ),
      unselectedLabelTextStyle: TextStyle(
        color: dark ? ZhixuColors.muted : const Color(0xFF68788A),
      ),
      indicatorColor: dark ? ZhixuColors.accentSoft : const Color(0xFFE6F0FF),
      labelType: NavigationRailLabelType.none,
    ),
    textTheme: base.textTheme.copyWith(
      headlineMedium: const TextStyle(
        fontSize: 28,
        fontWeight: FontWeight.w800,
        letterSpacing: 0,
      ),
      titleLarge: const TextStyle(
        fontSize: 19,
        fontWeight: FontWeight.w700,
        letterSpacing: 0,
      ),
      titleMedium: const TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.w700,
        letterSpacing: 0,
      ),
      bodyMedium: const TextStyle(fontSize: 14, letterSpacing: 0),
      bodySmall: const TextStyle(fontSize: 12, letterSpacing: 0),
    ),
  );
}

Color statusColor(String status) => switch (status) {
  'done' => ZhixuColors.success,
  'in_progress' => ZhixuColors.accent,
  'blocked' => ZhixuColors.danger,
  _ => ZhixuColors.muted,
};

String priorityLabel(int priority) => switch (priority) {
  3 => '高',
  2 => '中',
  _ => '低',
};

Color priorityColor(int priority) => switch (priority) {
  3 => ZhixuColors.danger,
  2 => ZhixuColors.warning,
  _ => ZhixuColors.success,
};
