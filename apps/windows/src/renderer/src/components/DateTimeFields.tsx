import {
  DatePicker,
  defaultDatePickerStrings,
  type CalendarStrings,
} from "@fluentui/react-datepicker-compat";
import { TimePicker } from "@fluentui/react-timepicker-compat";
import { localDateKey, parseLocalDateKey } from "../../../shared/local-date";

const zhCnDateStrings: CalendarStrings = {
  ...defaultDatePickerStrings,
  months: [
    "一月",
    "二月",
    "三月",
    "四月",
    "五月",
    "六月",
    "七月",
    "八月",
    "九月",
    "十月",
    "十一月",
    "十二月",
  ],
  shortMonths: [
    "1月",
    "2月",
    "3月",
    "4月",
    "5月",
    "6月",
    "7月",
    "8月",
    "9月",
    "10月",
    "11月",
    "12月",
  ],
  days: ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"],
  shortDays: ["日", "一", "二", "三", "四", "五", "六"],
  goToToday: "今天",
  prevMonthAriaLabel: "上个月",
  nextMonthAriaLabel: "下个月",
  prevYearAriaLabel: "上一年",
  nextYearAriaLabel: "下一年",
  closeButtonAriaLabel: "关闭日期选择器",
  monthPickerHeaderAriaLabel: "选择月份",
  yearPickerHeaderAriaLabel: "选择年份",
};

function parseDateInput(value: string): Date | null {
  const normalized = value
    .trim()
    .replace(/[年/.]/g, "-")
    .replace(/月/g, "-")
    .replace(/日/g, "")
    .replace(/-+/g, "-");
  const parts = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(normalized);
  if (!parts) return null;
  try {
    return parseLocalDateKey(
      `${parts[1]}-${String(Number(parts[2])).padStart(2, "0")}-${String(Number(parts[3])).padStart(2, "0")}`,
    );
  } catch {
    return null;
  }
}

function timeValue(value: string, anchor = new Date()): Date | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  const result = new Date(anchor);
  result.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return result;
}

function formatTime(value: Date): string {
  return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
}

export interface LocalDateFieldProps {
  value: string;
  onChange(value: string): void;
  ariaLabel: string;
  min?: string;
  max?: string;
  required?: boolean;
}

export function LocalDateField({
  value,
  onChange,
  ariaLabel,
  min,
  max,
  required = false,
}: LocalDateFieldProps): React.JSX.Element {
  return (
    <DatePicker
      className="fluent-date-field"
      aria-label={ariaLabel}
      value={value ? parseLocalDateKey(value) : null}
      onSelectDate={(date) => onChange(date ? localDateKey(date) : "")}
      onChange={(event) => {
        const input = event.target.value.trim();
        if (!input) onChange("");
        else {
          const parsed = parseDateInput(input);
          const minimum = min ? parseLocalDateKey(min) : null;
          const maximum = max ? parseLocalDateKey(max) : null;
          if (
            parsed &&
            (!minimum || parsed >= minimum) &&
            (!maximum || parsed <= maximum)
          )
            onChange(localDateKey(parsed));
        }
      }}
      minDate={min ? parseLocalDateKey(min) : undefined}
      maxDate={max ? parseLocalDateKey(max) : undefined}
      allowTextInput
      required={required}
      firstDayOfWeek={1}
      showGoToToday
      highlightCurrentMonth
      strings={zhCnDateStrings}
      placeholder="选择日期"
      formatDate={(date) =>
        date
          ? `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
          : ""
      }
      parseDateFromString={parseDateInput}
    />
  );
}

export interface LocalTimeFieldProps {
  value: string;
  onChange(value: string): void;
  ariaLabel: string;
  optional?: boolean;
  anchorDate?: string;
}

export function LocalTimeField({
  value,
  onChange,
  ariaLabel,
  optional = false,
  anchorDate,
}: LocalTimeFieldProps): React.JSX.Element {
  const anchor = anchorDate ? parseLocalDateKey(anchorDate) : new Date();
  return (
    <TimePicker
      className="fluent-time-field"
      aria-label={ariaLabel}
      selectedTime={timeValue(value, anchor)}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onTimeChange={(_, data) =>
        onChange(data.selectedTime ? formatTime(data.selectedTime) : "")
      }
      increment={15}
      freeform
      clearable={optional}
      placeholder={optional ? "选择时间（可选）" : "选择时间"}
      hourCycle="h23"
      formatDateToTimeString={formatTime}
      parseTimeStringToDate={(input) => {
        const parsed = input ? timeValue(input, anchor) : null;
        return parsed
          ? { date: parsed }
          : optional && !input
            ? { date: null }
            : { date: null, errorType: "invalid-input" };
      }}
    />
  );
}
