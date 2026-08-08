import 'package:flutter/material.dart';

class ZhixuColors {
  static const canvas = Color(0xFF14171B);
  static const surface = Color(0xFF1B1F24);
  static const surfaceRaised = Color(0xFF23282F);
  static const border = Color(0xFF343A43);
  static const text = Color(0xFFF2F4F7);
  static const muted = Color(0xFF9AA5B1);
  static const accent = Color(0xFF2D63D7);
  static const accentSoft = Color(0xFFDCE7FA);
  static const success = Color(0xFF2F9E62);
  static const warning = Color(0xFFD9871F);
  static const danger = Color(0xFFD94C56);
  static const purple = Color(0xFF7C61C9);
  static const cyan = Color(0xFF258FA3);
}

ThemeData buildZhixuTheme({required Brightness brightness}) {
  final dark = brightness == Brightness.dark;
  final scheme =
      ColorScheme.fromSeed(
        seedColor: ZhixuColors.accent,
        brightness: brightness,
        surface: dark ? ZhixuColors.surface : Colors.white,
      ).copyWith(
        primary: dark ? const Color(0xFF78A5FF) : ZhixuColors.accent,
        primaryContainer: dark
            ? const Color(0xFF233B62)
            : const Color(0xFFE1EAF9),
        onPrimaryContainer: dark
            ? const Color(0xFFE8F0FF)
            : const Color(0xFF18375F),
        surface: dark ? ZhixuColors.surface : Colors.white,
        surfaceContainerHighest: dark
            ? ZhixuColors.surfaceRaised
            : const Color(0xFFEFF2F5),
        outline: dark ? ZhixuColors.border : const Color(0xFFD8DEE6),
      );
  final base = ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    scaffoldBackgroundColor: dark
        ? ZhixuColors.canvas
        : const Color(0xFFF5F6F8),
    fontFamily: 'Noto Sans SC',
    visualDensity: VisualDensity.standard,
  );
  final foreground = dark ? ZhixuColors.text : const Color(0xFF1B222B);
  final secondary = dark ? ZhixuColors.muted : const Color(0xFF667382);
  return base.copyWith(
    appBarTheme: AppBarTheme(
      backgroundColor: Colors.transparent,
      foregroundColor: foreground,
      elevation: 0,
      titleTextStyle: TextStyle(
        fontFamily: 'Noto Sans SC',
        fontSize: 20,
        fontWeight: FontWeight.w700,
        color: foreground,
      ),
    ),
    cardTheme: CardThemeData(
      color: dark ? ZhixuColors.surface : Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(7),
        side: BorderSide(color: scheme.outline),
      ),
    ),
    dividerTheme: DividerThemeData(
      color: scheme.outline,
      space: 1,
      thickness: 1,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: dark ? const Color(0xFF171B20) : Colors.white,
      hintStyle: TextStyle(color: secondary, fontSize: 14),
      labelStyle: TextStyle(color: secondary, fontSize: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(6),
        borderSide: BorderSide(color: scheme.outline),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(6),
        borderSide: BorderSide(color: scheme.outline),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(6),
        borderSide: BorderSide(color: scheme.primary, width: 1.5),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
    ),
    chipTheme: base.chipTheme.copyWith(
      side: BorderSide(color: scheme.outline),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(5)),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      labelStyle: TextStyle(fontSize: 13, color: foreground),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(0, 42),
        padding: const EdgeInsets.symmetric(horizontal: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(0, 42),
        padding: const EdgeInsets.symmetric(horizontal: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
        side: BorderSide(color: scheme.outline),
        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        minimumSize: const Size(0, 40),
        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
      ),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(
        minimumSize: const Size.square(40),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
      ),
    ),
    listTileTheme: ListTileThemeData(
      minTileHeight: 50,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      titleTextStyle: TextStyle(
        color: foreground,
        fontSize: 15,
        fontWeight: FontWeight.w600,
      ),
      subtitleTextStyle: TextStyle(color: secondary, fontSize: 13),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: dark ? ZhixuColors.surfaceRaised : Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      titleTextStyle: TextStyle(
        color: foreground,
        fontSize: 20,
        fontWeight: FontWeight.w700,
      ),
    ),
    textTheme: base.textTheme
        .copyWith(
          headlineMedium: TextStyle(
            fontSize: 27,
            fontWeight: FontWeight.w700,
            color: foreground,
            letterSpacing: 0,
          ),
          titleLarge: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w700,
            color: foreground,
            letterSpacing: 0,
          ),
          titleMedium: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            color: foreground,
            letterSpacing: 0,
          ),
          bodyLarge: TextStyle(
            fontSize: 16,
            color: foreground,
            letterSpacing: 0,
          ),
          bodyMedium: TextStyle(
            fontSize: 15,
            color: foreground,
            letterSpacing: 0,
          ),
          bodySmall: TextStyle(
            fontSize: 13,
            color: secondary,
            letterSpacing: 0,
          ),
          labelLarge: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: foreground,
            letterSpacing: 0,
          ),
        )
        .apply(fontFamily: 'Noto Sans SC'),
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
