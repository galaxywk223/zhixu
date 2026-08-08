import 'package:flutter/material.dart';

class ZhixuColors {
  static const canvas = Color(0xFF0B0E14);
  static const surface = Color(0xFF131722);
  static const surfaceRaised = Color(0xFF1C2230);
  static const surfaceHighlight = Color(0xFF262E40);
  static const border = Color(0xFF242B3B);
  static const borderHighlight = Color(0x446366F1);
  static const text = Color(0xFFF3F4F6);
  static const muted = Color(0xFF9CA3AF);
  static const accent = Color(0xFF6366F1);
  static const accentSecondary = Color(0xFF06B6D4);
  static const accentSoft = Color(0xFF1E2640);
  static const success = Color(0xFF10B981);
  static const warning = Color(0xFFF59E0B);
  static const danger = Color(0xFFEF4444);
  static const purple = Color(0xFF8B5CF6);
  static const cyan = Color(0xFF06B6D4);

  static const primaryGradient = LinearGradient(
    colors: [Color(0xFF6366F1), Color(0xFF06B6D4)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const accentGlowGradient = LinearGradient(
    colors: [Color(0x336366F1), Color(0x1106B6D4)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const cardGradient = LinearGradient(
    colors: [Color(0xFF151A26), Color(0xFF111520)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );
}

ThemeData buildZhixuTheme({required Brightness brightness}) {
  final dark = brightness == Brightness.dark;
  final scheme =
      ColorScheme.fromSeed(
        seedColor: ZhixuColors.accent,
        brightness: brightness,
        surface: dark ? ZhixuColors.surface : Colors.white,
      ).copyWith(
        primary: dark ? const Color(0xFF818CF8) : ZhixuColors.accent,
        primaryContainer: dark
            ? const Color(0xFF1E2640)
            : const Color(0xFFEEF2FF),
        onPrimaryContainer: dark
            ? const Color(0xFFE0E7FF)
            : const Color(0xFF3730A3),
        surface: dark ? ZhixuColors.surface : Colors.white,
        surfaceContainerHighest: dark
            ? ZhixuColors.surfaceRaised
            : const Color(0xFFF3F4F6),
        outline: dark ? ZhixuColors.border : const Color(0xFFE5E7EB),
      );
  final base = ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    scaffoldBackgroundColor: dark
        ? ZhixuColors.canvas
        : const Color(0xFFF9FAFB),
    fontFamily: 'Noto Sans SC',
    visualDensity: VisualDensity.standard,
  );
  final foreground = dark ? ZhixuColors.text : const Color(0xFF111827);
  final secondary = dark ? ZhixuColors.muted : const Color(0xFF6B7280);
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
        borderRadius: BorderRadius.circular(14),
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
      fillColor: dark ? const Color(0xFF10141D) : Colors.white,
      hintStyle: TextStyle(color: secondary, fontSize: 14),
      labelStyle: TextStyle(color: secondary, fontSize: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: scheme.outline),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: scheme.outline),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: ZhixuColors.accent, width: 1.8),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    ),
    chipTheme: base.chipTheme.copyWith(
      side: BorderSide(color: scheme.outline),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      labelStyle: TextStyle(fontSize: 13, color: foreground),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(0, 42),
        padding: const EdgeInsets.symmetric(horizontal: 18),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(0, 42),
        padding: const EdgeInsets.symmetric(horizontal: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        side: BorderSide(color: scheme.outline),
        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        minimumSize: const Size(0, 40),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
      ),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(
        minimumSize: const Size.square(40),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    ),
    listTileTheme: ListTileThemeData(
      minTileHeight: 52,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      titleTextStyle: TextStyle(
        color: foreground,
        fontSize: 15,
        fontWeight: FontWeight.w600,
      ),
      subtitleTextStyle: TextStyle(color: secondary, fontSize: 13),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: dark ? ZhixuColors.surface : Colors.white,
      surfaceTintColor: Colors.transparent,
      elevation: 12,
      shadowColor: Colors.black.withValues(alpha: 0.5),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: scheme.outline),
      ),
      titleTextStyle: TextStyle(
        color: foreground,
        fontSize: 20,
        fontWeight: FontWeight.w700,
      ),
    ),
    datePickerTheme: DatePickerThemeData(
      backgroundColor: dark ? ZhixuColors.surface : Colors.white,
      surfaceTintColor: Colors.transparent,
      headerBackgroundColor: Colors.transparent,
      headerForegroundColor: foreground,
      headerHeadlineStyle: TextStyle(
        fontFamily: 'Noto Sans SC',
        fontSize: 22,
        fontWeight: FontWeight.w700,
        color: foreground,
      ),
      weekdayStyle: TextStyle(
        fontFamily: 'Noto Sans SC',
        color: secondary,
        fontSize: 13,
        fontWeight: FontWeight.w600,
      ),
      dayStyle: const TextStyle(
        fontFamily: 'Noto Sans SC',
        fontSize: 14,
        fontWeight: FontWeight.w500,
      ),
      dayForegroundColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) return Colors.white;
        return foreground;
      }),
      dayBackgroundColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) return ZhixuColors.accent;
        return Colors.transparent;
      }),
      todayBorder: const BorderSide(color: ZhixuColors.accent, width: 1.5),
      todayForegroundColor: WidgetStateProperty.all(ZhixuColors.accent),
      yearStyle: TextStyle(
        fontFamily: 'Noto Sans SC',
        color: foreground,
        fontSize: 14,
      ),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: scheme.outline),
      ),
      elevation: 12,
      shadowColor: Colors.black.withValues(alpha: 0.5),
    ),
    timePickerTheme: TimePickerThemeData(
      backgroundColor: dark ? ZhixuColors.surface : Colors.white,
      hourMinuteColor: dark ? ZhixuColors.surfaceRaised : Colors.grey.shade100,
      hourMinuteTextColor: foreground,
      dayPeriodColor: dark ? ZhixuColors.surfaceRaised : Colors.grey.shade100,
      dayPeriodTextColor: foreground,
      dialBackgroundColor: dark ? ZhixuColors.surfaceRaised : Colors.grey.shade100,
      dialHandColor: ZhixuColors.accent,
      dialTextColor: foreground,
      entryModeIconColor: secondary,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: scheme.outline),
      ),
    ),
    textTheme: base.textTheme
        .copyWith(
          headlineMedium: TextStyle(
            fontSize: 26,
            fontWeight: FontWeight.w800,
            color: foreground,
            letterSpacing: -0.5,
          ),
          titleLarge: TextStyle(
            fontSize: 19,
            fontWeight: FontWeight.w700,
            color: foreground,
            letterSpacing: -0.3,
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
