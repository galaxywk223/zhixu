import { useState } from "react";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  LocalDateField,
  LocalTimeField,
} from "../src/renderer/src/components/DateTimeFields";

afterEach(cleanup);

function DateTimeHarness(): React.JSX.Element {
  const [date, setDate] = useState("2026-08-09");
  const [time, setTime] = useState("");
  return (
    <FluentProvider theme={webLightTheme}>
      <LocalDateField
        ariaLabel="测试日期"
        value={date}
        onChange={setDate}
        min="2026-08-07"
      />
      <LocalTimeField
        ariaLabel="测试时间"
        value={time}
        onChange={setTime}
        anchorDate={date}
        optional
      />
      <output>{`${date} ${time || "未设置"}`}</output>
    </FluentProvider>
  );
}

describe("shared Fluent date and time fields", () => {
  it("accepts local date text without crossing the minimum boundary", () => {
    render(<DateTimeHarness />);
    const input = screen.getByLabelText("测试日期");
    fireEvent.change(input, { target: { value: "2026-08-08" } });
    expect(screen.getByText("2026-08-08 未设置")).toBeTruthy();
    fireEvent.change(input, { target: { value: "2026-08-01" } });
    expect(screen.getByText("2026-08-08 未设置")).toBeTruthy();
  });

  it("supports freeform optional time input", () => {
    render(<DateTimeHarness />);
    const input = screen.getByLabelText("测试时间");
    fireEvent.change(input, { target: { value: "09:25" } });
    fireEvent.blur(input);
    expect(screen.getByText("2026-08-09 09:25")).toBeTruthy();
  });
});
