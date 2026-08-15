import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
} from "@fluentui/react-components";
import type { TaskRecord } from "../../../preload/api-types";

export type TaskScopeAction = "edit" | "delete";

interface TaskScopeDialogProps {
  task: TaskRecord | null;
  action: TaskScopeAction | null;
  seriesCount: number;
  pending?: boolean;
  error?: string | null;
  onClose(): void;
  onSingle(): void;
  onSeries(): void;
}

export function TaskScopeDialog(
  props: TaskScopeDialogProps,
): React.JSX.Element {
  const [confirmSeriesDelete, setConfirmSeriesDelete] = useState(false);

  useEffect(() => setConfirmSeriesDelete(false), [props.task, props.action]);

  const open = Boolean(props.task && props.action);
  const isSeries = Boolean(props.task?.series);
  const deleting = props.action === "delete";
  const title = confirmSeriesDelete
    ? "删除整个任务系列？"
    : deleting
      ? isSeries
        ? "选择删除范围"
        : "删除任务？"
      : "选择编辑范围";

  return (
    <Dialog
      open={open}
      onOpenChange={(_, data) => {
        if (!data.open && !props.pending) props.onClose();
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>
            {confirmSeriesDelete ? (
              <p>
                将删除“{props.task?.title}”所属系列中的 {props.seriesCount}
                项任务。该操作会同步到已绑定设备。
              </p>
            ) : isSeries ? (
              <p>
                “{props.task?.title}”属于包含 {props.seriesCount}
                项任务的系列。
              </p>
            ) : (
              <p>确认删除“{props.task?.title}”？</p>
            )}
            {props.error ? (
              <div className="error-message" role="alert">
                {props.error}
              </div>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button
              appearance="secondary"
              onClick={props.onClose}
              disabled={props.pending}
            >
              取消
            </Button>
            {confirmSeriesDelete ? (
              <Button
                appearance="primary"
                onClick={props.onSeries}
                disabled={props.pending}
              >
                {props.pending ? "删除中" : "确认删除整个系列"}
              </Button>
            ) : isSeries ? (
              <>
                <Button onClick={props.onSingle} disabled={props.pending}>
                  {deleting ? "仅删除此任务" : "仅编辑此任务"}
                </Button>
                <Button
                  appearance="primary"
                  onClick={() => {
                    if (deleting) setConfirmSeriesDelete(true);
                    else props.onSeries();
                  }}
                  disabled={props.pending}
                >
                  {deleting ? "删除整个系列" : "编辑整个系列"}
                </Button>
              </>
            ) : (
              <Button
                appearance="primary"
                onClick={props.onSingle}
                disabled={props.pending}
              >
                {props.pending ? "删除中" : "删除任务"}
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
