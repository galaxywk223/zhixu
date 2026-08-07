import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/theme.dart';

class AppShell extends StatelessWidget {
  const AppShell({required this.child, super.key});

  final Widget child;

  static const _items = [
    _NavItem('今天', Icons.wb_sunny_outlined, '/today'),
    _NavItem('任务', Icons.check_box_outlined, '/tasks'),
    _NavItem('日历', Icons.calendar_month_outlined, '/calendar'),
    _NavItem('专注', Icons.timer_outlined, '/focus'),
    _NavItem('睡眠', Icons.bedtime_outlined, '/sleep'),
    _NavItem('笔记', Icons.edit_note_outlined, '/notes'),
    _NavItem('统计', Icons.bar_chart_outlined, '/stats'),
  ];

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).uri.path;
    final selected = _items.indexWhere(
      (item) => location.startsWith(item.path),
    );
    return Scaffold(
      body: Row(
        children: [
          _Sidebar(selectedIndex: selected < 0 ? 0 : selected),
          Expanded(child: child),
        ],
      ),
    );
  }
}

class _Sidebar extends StatelessWidget {
  const _Sidebar({required this.selectedIndex});

  final int selectedIndex;

  static const _items = AppShell._items;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = MediaQuery.sizeOf(context).width < 1180;
        return Container(
          width: compact ? 76 : 224,
          decoration: BoxDecoration(
            color: Theme.of(context).brightness == Brightness.dark
                ? const Color(0xFF0A111A)
                : Colors.white,
            border: Border(
              right: BorderSide(color: Theme.of(context).dividerColor),
            ),
          ),
          child: SafeArea(
            child: Column(
              children: [
                Padding(
                  padding: EdgeInsets.fromLTRB(
                    compact ? 14 : 20,
                    18,
                    compact ? 14 : 20,
                    24,
                  ),
                  child: Row(
                    mainAxisAlignment: compact
                        ? MainAxisAlignment.center
                        : MainAxisAlignment.start,
                    children: [
                      Container(
                        width: 34,
                        height: 34,
                        decoration: BoxDecoration(
                          color: ZhixuColors.accent,
                          borderRadius: BorderRadius.circular(9),
                        ),
                        child: const Icon(
                          Icons.auto_awesome,
                          color: Colors.white,
                          size: 20,
                        ),
                      ),
                      if (!compact) ...[
                        const SizedBox(width: 10),
                        Text(
                          '知序',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                      ],
                    ],
                  ),
                ),
                Expanded(
                  child: ListView.separated(
                    padding: EdgeInsets.symmetric(
                      horizontal: compact ? 10 : 12,
                    ),
                    itemCount: _items.length,
                    separatorBuilder: (_, index) => index == 0
                        ? const SizedBox(height: 4)
                        : const SizedBox(height: 3),
                    itemBuilder: (context, index) {
                      final item = _items[index];
                      final active = index == selectedIndex;
                      return Tooltip(
                        message: item.label,
                        child: InkWell(
                          borderRadius: BorderRadius.circular(6),
                          onTap: () => context.go(item.path),
                          child: Container(
                            height: 42,
                            padding: EdgeInsets.symmetric(
                              horizontal: compact ? 0 : 12,
                            ),
                            decoration: BoxDecoration(
                              color: active
                                  ? ZhixuColors.accentSoft
                                  : Colors.transparent,
                              borderRadius: BorderRadius.circular(6),
                              border: active
                                  ? Border.all(
                                      color: ZhixuColors.accent.withValues(
                                        alpha: .45,
                                      ),
                                    )
                                  : null,
                            ),
                            child: Row(
                              mainAxisAlignment: compact
                                  ? MainAxisAlignment.center
                                  : MainAxisAlignment.start,
                              children: [
                                Icon(
                                  item.icon,
                                  size: 20,
                                  color: active
                                      ? ZhixuColors.accent
                                      : ZhixuColors.muted,
                                ),
                                if (!compact) ...[
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Text(
                                      item.label,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                        color: active
                                            ? ZhixuColors.text
                                            : ZhixuColors.muted,
                                        fontWeight: active
                                            ? FontWeight.w700
                                            : FontWeight.w500,
                                      ),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
                Padding(
                  padding: EdgeInsets.fromLTRB(
                    compact ? 10 : 12,
                    10,
                    compact ? 10 : 12,
                    16,
                  ),
                  child: Tooltip(
                    message: '设置',
                    child: InkWell(
                      borderRadius: BorderRadius.circular(6),
                      onTap: () => context.go('/settings'),
                      child: Container(
                        height: 42,
                        padding: EdgeInsets.symmetric(
                          horizontal: compact ? 0 : 12,
                        ),
                        child: Row(
                          mainAxisAlignment: compact
                              ? MainAxisAlignment.center
                              : MainAxisAlignment.start,
                          children: [
                            const Icon(
                              Icons.settings_outlined,
                              color: ZhixuColors.muted,
                              size: 20,
                            ),
                            if (!compact) ...[
                              const SizedBox(width: 12),
                              const Text(
                                '设置',
                                style: TextStyle(color: ZhixuColors.muted),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _NavItem {
  const _NavItem(this.label, this.icon, this.path);

  final String label;
  final IconData icon;
  final String path;
}
