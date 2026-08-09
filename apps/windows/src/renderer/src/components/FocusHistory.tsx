import type { FocusSessionRecord } from "../../../preload/api-types";
import { groupFocusByLocalDate } from "../../../shared/focus-dates";
import { EmptyState } from "./Page";

function dateLabel(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

export function FocusHistory(props: {
  sessions: FocusSessionRecord[];
}): React.JSX.Element {
  const groups = groupFocusByLocalDate(props.sessions);
  if (groups.length === 0)
    return (
      <EmptyState
        title="当前范围暂无专注记录"
        detail="切换快捷视图或导入番茄 TODO 历史记录。"
      />
    );
  return (
    <div className="focus-history-table-wrap">
      <table className="focus-history-table" aria-label="专注明细">
        <thead>
          <tr>
            <th scope="col">时间</th>
            <th scope="col">事项</th>
            <th scope="col">时长</th>
            <th scope="col">状态</th>
            <th scope="col">复盘</th>
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group.date}>
            <tr className="focus-history-group">
              <th colSpan={5} scope="rowgroup">
                <strong>{dateLabel(group.date)}</strong>
                <span>
                  {group.items.length} 条 · {group.totalMinutes} 分钟
                </span>
              </th>
            </tr>
            {group.items.map((item) => (
              <tr key={item.id}>
                <td>
                  <time dateTime={item.startAt}>
                    {new Date(item.startAt).toLocaleTimeString("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </td>
                <td className="focus-history-title">
                  <strong>{item.taskName}</strong>
                </td>
                <td>{item.durationMinutes} 分钟</td>
                <td>{item.status || "未知"}</td>
                <td className="focus-history-reflection">
                  {item.reflection || "--"}
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
