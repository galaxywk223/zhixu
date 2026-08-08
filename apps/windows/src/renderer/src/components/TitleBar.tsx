import { Button, Tooltip } from "@fluentui/react-components";
import {
  Dismiss20Regular,
  SquareMultiple20Regular,
  Subtract20Regular,
} from "@fluentui/react-icons";

export function TitleBar(): React.JSX.Element {
  return (
    <header className="titlebar">
      <div className="titlebar-drag">
        <img src="/zhixu-mark-1024.png" alt="" className="titlebar-logo" />
        <span>知序</span>
      </div>
      <div className="window-controls">
        <Tooltip content="最小化" relationship="label">
          <Button
            appearance="subtle"
            icon={<Subtract20Regular />}
            onClick={() => window.zhixu.window.minimize()}
          />
        </Tooltip>
        <Tooltip content="最大化或还原" relationship="label">
          <Button
            appearance="subtle"
            icon={<SquareMultiple20Regular />}
            onClick={() => window.zhixu.window.toggleMaximize()}
          />
        </Tooltip>
        <Tooltip content="关闭" relationship="label">
          <Button
            className="close-button"
            appearance="subtle"
            icon={<Dismiss20Regular />}
            onClick={() => window.zhixu.window.close()}
          />
        </Tooltip>
      </div>
    </header>
  );
}
