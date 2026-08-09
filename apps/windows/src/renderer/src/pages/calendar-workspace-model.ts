import type {
  FocusSessionRecord,
  TaskRecord,
} from "../../../preload/api-types";
import {
  addLocalDays,
  localDateKey,
  localDayStart,
} from "../../../shared/local-date";

export interface CalendarMonthDay {
  date: Date;
  key: string;
  inCurrentMonth: boolean;
  isToday: boolean;
  tasks: TaskRecord[];
  visibleTasks: TaskRecord[];
  hiddenTaskCount: number;
}

export interface CalendarMonthModel {
  days: CalendarMonthDay[];
  selectedTasks: TaskRecord[];
  metrics: {
    completed: number;
    total: number;
    completionRate: number;
    estimatedMinutes: number;
    highPriority: number;
  };
}

export interface FocusTimelineSegment {
  id: string;
  session: FocusSessionRecord;
  dayKey: string;
  startMinutes: number;
  endMinutes: number;
  lane: number;
  laneCount: number;
  continuesFromPreviousDay: boolean;
  continuesToNextDay: boolean;
}

export interface FocusWeekDay {
  date: Date;
  key: string;
  isToday: boolean;
  segments: FocusTimelineSegment[];
  sessions: FocusSessionRecord[];
  allocatedMinutes: number;
}

export interface FocusWeekModel {
  start: Date;
  end: Date;
  days: FocusWeekDay[];
  timeline: {
    startMinutes: number;
    endMinutes: number;
    minuteScale: number;
  } | null;
  metrics: {
    count: number;
    minutes: number;
    focusDays: number;
    averageMinutes: number;
  };
}

const timelinePaddingMinutes = 30;
const timelineStepMinutes = 30;
const minimumTimelineMinutes = 120;
const minimumBlockHeight = 64;
const minimumScaleDuration = 10;
const minimumMinuteScale = 1;
const maximumMinuteScale = 6.4;

function validDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function mondayForDate(value: Date): Date {
  const date = localDayStart(value);
  return addLocalDays(date, -((date.getDay() + 6) % 7));
}

export function sortCalendarTasks(tasks: TaskRecord[]): TaskRecord[] {
  return [...tasks].sort((left, right) => {
    const completion =
      Number(left.status === "done") - Number(right.status === "done");
    if (completion !== 0) return completion;
    if (left.priority !== right.priority) return right.priority - left.priority;
    const leftDue = left.dueAt
      ? Date.parse(left.dueAt)
      : Number.MAX_SAFE_INTEGER;
    const rightDue = right.dueAt
      ? Date.parse(right.dueAt)
      : Number.MAX_SAFE_INTEGER;
    if (leftDue !== rightDue) return leftDue - rightDue;
    return left.title.localeCompare(right.title, "zh-CN");
  });
}

export function buildCalendarMonth(
  tasks: TaskRecord[],
  cursor: Date,
  selected: Date,
  now = new Date(),
): CalendarMonthModel {
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = addLocalDays(monthStart, -((monthStart.getDay() + 6) % 7));
  const byDay = new Map<string, TaskRecord[]>();
  for (const task of tasks) {
    if (!task.dueAt) continue;
    const due = validDate(task.dueAt);
    if (!due) continue;
    const key = localDateKey(due);
    const items = byDay.get(key) ?? [];
    items.push(task);
    byDay.set(key, items);
  }

  const days = Array.from({ length: 42 }, (_, index) => {
    const date = addLocalDays(gridStart, index);
    const key = localDateKey(date);
    const dayTasks = sortCalendarTasks(byDay.get(key) ?? []);
    return {
      date,
      key,
      inCurrentMonth: date.getMonth() === cursor.getMonth(),
      isToday: key === localDateKey(now),
      tasks: dayTasks,
      visibleTasks: dayTasks.slice(0, 3),
      hiddenTaskCount: Math.max(0, dayTasks.length - 3),
    };
  });

  const monthTasks = days
    .filter((day) => day.inCurrentMonth)
    .flatMap((day) => day.tasks);
  const completed = monthTasks.filter((task) => task.status === "done").length;
  const total = monthTasks.length;
  return {
    days,
    selectedTasks: sortCalendarTasks(byDay.get(localDateKey(selected)) ?? []),
    metrics: {
      completed,
      total,
      completionRate: total ? Math.round((completed / total) * 100) : 0,
      estimatedMinutes: monthTasks.reduce(
        (sum, task) => sum + Math.max(0, task.estimatedMinutes),
        0,
      ),
      highPriority: monthTasks.filter(
        (task) => task.status !== "done" && task.priority >= 3,
      ).length,
    },
  };
}

function assignOverlapLanes(
  input: Omit<FocusTimelineSegment, "lane" | "laneCount">[],
): FocusTimelineSegment[] {
  const sorted = [...input].sort(
    (left, right) =>
      left.startMinutes - right.startMinutes ||
      left.endMinutes - right.endMinutes,
  );
  const result: FocusTimelineSegment[] = [];
  let cluster: Array<Omit<FocusTimelineSegment, "lane" | "laneCount">> = [];
  let clusterEnd = -1;

  const flush = (): void => {
    if (!cluster.length) return;
    const laneEnds: number[] = [];
    const assigned = cluster.map((segment) => {
      let lane = laneEnds.findIndex((end) => end <= segment.startMinutes);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(segment.endMinutes);
      } else {
        laneEnds[lane] = segment.endMinutes;
      }
      return { segment, lane };
    });
    const laneCount = laneEnds.length;
    result.push(
      ...assigned.map(({ segment, lane }) => ({ ...segment, lane, laneCount })),
    );
    cluster = [];
    clusterEnd = -1;
  };

  for (const segment of sorted) {
    if (cluster.length && segment.startMinutes >= clusterEnd) flush();
    cluster.push(segment);
    clusterEnd = Math.max(clusterEnd, segment.endMinutes);
  }
  flush();
  return result;
}

function splitSession(
  session: FocusSessionRecord,
  weekStart: Date,
  weekEnd: Date,
): Array<Omit<FocusTimelineSegment, "lane" | "laneCount">> {
  const start = validDate(session.startAt);
  const end = validDate(session.endAt);
  if (!start || !end || end <= start || end <= weekStart || start >= weekEnd)
    return [];

  const clippedStart = new Date(Math.max(start.getTime(), weekStart.getTime()));
  const clippedEnd = new Date(Math.min(end.getTime(), weekEnd.getTime()));
  const segments: Array<Omit<FocusTimelineSegment, "lane" | "laneCount">> = [];
  for (
    let day = localDayStart(clippedStart);
    day < clippedEnd;
    day = addLocalDays(day, 1)
  ) {
    const nextDay = addLocalDays(day, 1);
    const segmentStart = new Date(Math.max(start.getTime(), day.getTime()));
    const segmentEnd = new Date(Math.min(end.getTime(), nextDay.getTime()));
    if (segmentEnd <= segmentStart) continue;
    const startMinutes =
      segmentStart.getHours() * 60 + segmentStart.getMinutes();
    const endMinutes =
      segmentEnd.getTime() === nextDay.getTime()
        ? 1440
        : segmentEnd.getHours() * 60 + segmentEnd.getMinutes();
    const dayKey = localDateKey(day);
    segments.push({
      id: `${session.id}:${dayKey}`,
      session,
      dayKey,
      startMinutes,
      endMinutes,
      continuesFromPreviousDay: start < day,
      continuesToNextDay: end > nextDay,
    });
  }
  return segments;
}

export function buildFocusWeek(
  sessions: FocusSessionRecord[],
  anchor: Date,
  now = new Date(),
): FocusWeekModel {
  const start = mondayForDate(anchor);
  const end = addLocalDays(start, 7);
  const validSessions = sessions.filter((session) => {
    const sessionStart = validDate(session.startAt);
    const sessionEnd = validDate(session.endAt);
    return (
      sessionStart !== null &&
      sessionEnd !== null &&
      sessionEnd > sessionStart &&
      sessionEnd > start &&
      sessionStart < end
    );
  });
  const rawSegments = validSessions.flatMap((session) =>
    splitSession(session, start, end),
  );
  const segmentsByDay = new Map<string, FocusTimelineSegment[]>();
  for (let index = 0; index < 7; index += 1) {
    const key = localDateKey(addLocalDays(start, index));
    segmentsByDay.set(
      key,
      assignOverlapLanes(
        rawSegments.filter((segment) => segment.dayKey === key),
      ),
    );
  }
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addLocalDays(start, index);
    const key = localDateKey(date);
    const segments = segmentsByDay.get(key) ?? [];
    const uniqueSessions = [
      ...new Map(
        segments.map((item) => [item.session.id, item.session]),
      ).values(),
    ].sort(
      (left, right) => Date.parse(left.startAt) - Date.parse(right.startAt),
    );
    return {
      date,
      key,
      isToday: key === localDateKey(now),
      segments,
      sessions: uniqueSessions,
      allocatedMinutes: segments.reduce(
        (sum, item) => sum + item.endMinutes - item.startMinutes,
        0,
      ),
    };
  });
  let timeline: FocusWeekModel["timeline"] = null;
  if (rawSegments.length) {
    const earliest = Math.min(...rawSegments.map((item) => item.startMinutes));
    const latest = Math.max(...rawSegments.map((item) => item.endMinutes));
    let startMinutes = Math.max(
      0,
      Math.floor((earliest - timelinePaddingMinutes) / timelineStepMinutes) *
        timelineStepMinutes,
    );
    let endMinutes = Math.min(
      1440,
      Math.ceil((latest + timelinePaddingMinutes) / timelineStepMinutes) *
        timelineStepMinutes,
    );
    while (endMinutes - startMinutes < minimumTimelineMinutes) {
      if (startMinutes >= timelineStepMinutes) {
        startMinutes -= timelineStepMinutes;
      } else if (endMinutes <= 1440 - timelineStepMinutes) {
        endMinutes += timelineStepMinutes;
      } else {
        break;
      }
    }
    const shortestDuration = Math.min(
      ...rawSegments.map((item) => item.endMinutes - item.startMinutes),
    );
    const minuteScale = Math.min(
      maximumMinuteScale,
      Math.max(
        minimumMinuteScale,
        minimumBlockHeight / Math.max(shortestDuration, minimumScaleDuration),
      ),
    );
    timeline = { startMinutes, endMinutes, minuteScale };
  }
  const totalMinutes = validSessions.reduce(
    (sum, session) => sum + Math.max(0, session.durationMinutes),
    0,
  );
  const focusDays = new Set(
    validSessions.map((session) => {
      const sessionStart = new Date(session.startAt);
      return localDateKey(sessionStart < start ? start : sessionStart);
    }),
  ).size;
  return {
    start,
    end,
    days,
    timeline,
    metrics: {
      count: validSessions.length,
      minutes: totalMinutes,
      focusDays,
      averageMinutes: validSessions.length
        ? Math.round(totalMinutes / validSessions.length)
        : 0,
    },
  };
}

export function formatWorkspaceMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (!hours) return `${rest}分钟`;
  if (!rest) return `${hours}小时`;
  return `${hours}小时${rest}分钟`;
}
