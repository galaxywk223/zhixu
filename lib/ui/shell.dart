import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../core/theme.dart';

class AppShell extends StatefulWidget {
  const AppShell({required this.child, super.key});

  final Widget child;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  bool collapsed = false;

  static const _groups = [
    _NavGroup('工作台', [
      _NavItem('今天', Icons.today_outlined, '/today'),
      _NavItem('任务', Icons.check_box_outlined, '/tasks'),
      _NavItem('日历', Icons.calendar_month_outlined, '/calendar'),
    ]),
    _NavGroup('记录', [
      _NavItem('专注', Icons.timer_outlined, '/focus'),
      _NavItem('睡眠', Icons.bedtime_outlined, '/sleep'),
      _NavItem('笔记', Icons.edit_note_outlined, '/notes'),
    ]),
    _NavGroup('分析', [_NavItem('统计', Icons.bar_chart_outlined, '/stats')]),
  ];

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).uri.path;
    final forceCompact = MediaQuery.sizeOf(context).width < 1180;
    final compact = forceCompact || collapsed;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      body: Row(
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOutCubic,
            width: compact ? 74 : 240,
            decoration: BoxDecoration(
              color: isDark ? ZhixuColors.surface : Theme.of(context).colorScheme.surface,
              border: Border(
                right: BorderSide(
                  color: isDark ? ZhixuColors.border : Theme.of(context).dividerColor,
                ),
              ),
            ),
            child: SafeArea(
              child: Column(
                children: [
                  _Brand(compact: compact),
                  const SizedBox(height: 8),
                  Expanded(
                    child: ListView(
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      children: [
                        for (final group in _groups) ...[
                          if (!compact)
                            Padding(
                              padding: const EdgeInsets.fromLTRB(12, 18, 12, 8),
                              child: Text(
                                group.label,
                                style: TextStyle(
                                  color: ZhixuColors.muted.withValues(alpha: 0.8),
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 0.8,
                                ),
                              ),
                            )
                          else
                            const SizedBox(height: 10),
                          for (final item in group.items)
                            _SidebarItem(
                              item: item,
                              compact: compact,
                              active: location.startsWith(item.path),
                              onTap: () => context.go(item.path),
                            ),
                        ],
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(10, 8, 10, 14),
                    child: Column(
                      children: [
                        _SidebarItem(
                          item: const _NavItem(
                            '设置',
                            Icons.settings_outlined,
                            '/settings',
                          ),
                          compact: compact,
                          active: location.startsWith('/settings'),
                          onTap: () => context.go('/settings'),
                        ),
                        if (!forceCompact) ...[
                          const SizedBox(height: 6),
                          _SidebarItem(
                            item: _NavItem(
                              compact ? '展开侧栏' : '收起侧栏',
                              compact
                                  ? Icons.keyboard_double_arrow_right
                                  : Icons.keyboard_double_arrow_left,
                              '',
                            ),
                            compact: compact,
                            active: false,
                            onTap: () => setState(() => collapsed = !collapsed),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          Expanded(child: widget.child),
        ],
      ),
    );
  }
}

class _Brand extends StatelessWidget {
  const _Brand({required this.compact});

  final bool compact;

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(compact ? 14 : 20, 20, compact ? 14 : 20, 14),
    child: Row(
      mainAxisAlignment: compact
          ? MainAxisAlignment.center
          : MainAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(2),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            gradient: const LinearGradient(
              colors: [Color(0xFF6366F1), Color(0xFF06B6D4)],
            ),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF6366F1).withValues(alpha: 0.35),
                blurRadius: 10,
                spreadRadius: 1,
              ),
            ],
          ),
          child: ClipRRect(
            key: const Key('zhixu-brand-mark'),
            borderRadius: BorderRadius.circular(8),
            child: Image.asset(
              'assets/branding/zhixu-mark-1024.png',
              width: 34,
              height: 34,
              filterQuality: FilterQuality.medium,
            ),
          ),
        ),
        if (!compact) ...[
          const SizedBox(width: 14),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '知序',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  fontSize: 17,
                  letterSpacing: -0.2,
                ),
              ),
              const SizedBox(height: 1),
              Text(
                '个人工作台',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  fontSize: 12,
                  color: ZhixuColors.muted,
                ),
              ),
            ],
          ),
        ],
      ],
    ),
  );
}

class _SidebarItem extends StatelessWidget {
  const _SidebarItem({
    required this.item,
    required this.compact,
    required this.active,
    required this.onTap,
  });

  final _NavItem item;
  final bool compact;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final child = InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        height: 46,
        padding: EdgeInsets.symmetric(horizontal: compact ? 0 : 12),
        decoration: BoxDecoration(
          color: active
              ? (isDark ? const Color(0xFF1E2640) : colors.primaryContainer)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          border: active && isDark
              ? Border.all(color: ZhixuColors.accent.withValues(alpha: 0.35))
              : null,
          boxShadow: active && isDark
              ? [
                  BoxShadow(
                    color: ZhixuColors.accent.withValues(alpha: 0.15),
                    blurRadius: 8,
                    spreadRadius: 0,
                  ),
                ]
              : null,
        ),
        child: Row(
          mainAxisAlignment: compact
              ? MainAxisAlignment.center
              : MainAxisAlignment.start,
          children: [
            Icon(
              item.icon,
              size: 21,
              color: active
                  ? (isDark ? const Color(0xFF818CF8) : colors.onPrimaryContainer)
                  : (isDark ? ZhixuColors.muted : colors.onSurfaceVariant),
            ),
            if (!compact) ...[
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  item.label,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: active
                        ? (isDark ? Colors.white : colors.onPrimaryContainer)
                        : (isDark ? ZhixuColors.muted : colors.onSurfaceVariant),
                    fontSize: 14.5,
                    fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
              ),
              if (active)
                Container(
                  width: 6,
                  height: 6,
                  decoration: const BoxDecoration(
                    color: ZhixuColors.accent,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: ZhixuColors.accent,
                        blurRadius: 6,
                      ),
                    ],
                  ),
                ),
            ],
          ],
        ),
      ),
    );
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: compact ? Tooltip(message: item.label, child: child) : child,
    );
  }
}

class _NavGroup {
  const _NavGroup(this.label, this.items);

  final String label;
  final List<_NavItem> items;
}

class _NavItem {
  const _NavItem(this.label, this.icon, this.path);

  final String label;
  final IconData icon;
  final String path;
}
