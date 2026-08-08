import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

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
    return Scaffold(
      body: Row(
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            width: compact ? 72 : 240,
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              border: Border(
                right: BorderSide(color: Theme.of(context).dividerColor),
              ),
            ),
            child: SafeArea(
              child: Column(
                children: [
                  _Brand(compact: compact),
                  Expanded(
                    child: ListView(
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      children: [
                        for (final group in _groups) ...[
                          if (!compact)
                            Padding(
                              padding: const EdgeInsets.fromLTRB(10, 18, 10, 7),
                              child: Text(
                                group.label,
                                style: Theme.of(context).textTheme.bodySmall
                                    ?.copyWith(fontWeight: FontWeight.w600),
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
    padding: EdgeInsets.fromLTRB(compact ? 14 : 20, 18, compact ? 14 : 20, 12),
    child: Row(
      mainAxisAlignment: compact
          ? MainAxisAlignment.center
          : MainAxisAlignment.start,
      children: [
        ClipRRect(
          key: const Key('zhixu-brand-mark'),
          borderRadius: BorderRadius.circular(7),
          child: Image.asset(
            'assets/branding/zhixu-mark-1024.png',
            width: 36,
            height: 36,
            filterQuality: FilterQuality.medium,
          ),
        ),
        if (!compact) ...[
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('知序', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 2),
              Text('个人工作台', style: Theme.of(context).textTheme.bodySmall),
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
    final child = InkWell(
      borderRadius: BorderRadius.circular(6),
      onTap: onTap,
      child: Container(
        height: 46,
        padding: EdgeInsets.symmetric(horizontal: compact ? 0 : 12),
        decoration: BoxDecoration(
          color: active ? colors.primaryContainer : Colors.transparent,
          borderRadius: BorderRadius.circular(6),
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
                  ? colors.onPrimaryContainer
                  : colors.onSurfaceVariant,
            ),
            if (!compact) ...[
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  item.label,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: active
                        ? colors.onPrimaryContainer
                        : colors.onSurfaceVariant,
                    fontSize: 15,
                    fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                  ),
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
