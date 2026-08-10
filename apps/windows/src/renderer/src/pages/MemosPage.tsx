import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  Select,
  Tag,
  TagPicker,
  TagPickerControl,
  TagPickerGroup,
  TagPickerInput,
  TagPickerList,
  TagPickerOption,
  Textarea,
} from "@fluentui/react-components";
import {
  Add20Regular,
  Clock20Regular,
  Delete20Regular,
  Edit20Regular,
  Folder20Regular,
  List20Regular,
  Search20Regular,
  Tag20Regular,
  Warning20Regular,
} from "@fluentui/react-icons";
import type { MemoDraft } from "@zhixu/contracts";
import type {
  CategoryRecord,
  MemoRecord,
  TagRecord,
} from "../../../preload/api-types";
import { normalizeTagName, tagTone } from "../../../shared/tag-colors";
import { EmptyState, Loading } from "../components/Page";
import { queryKeys } from "../query";
import {
  buildMemoWorkspace,
  DEFAULT_MEMO_FILTERS,
  MEMO_VIEW_LABELS,
  type MemoView,
} from "./memo-workspace-model";
import { loadMemoView, saveMemoView } from "../workspace-view-preferences";

const memoViews: Array<{ value: MemoView; icon: React.ReactNode }> = [
  { value: "all", icon: <List20Regular /> },
  { value: "high", icon: <Warning20Regular /> },
  { value: "medium", icon: <Clock20Regular /> },
  { value: "low", icon: <Clock20Regular /> },
];

export function MemosPage(props: {
  initialSelectedId: string | null;
}): React.JSX.Element {
  const client = useQueryClient();
  const memos = useQuery({
    queryKey: queryKeys.memos,
    queryFn: window.zhixu.memos.list,
  });
  const categories = useQuery({
    queryKey: queryKeys.categories,
    queryFn: window.zhixu.tasks.categories,
  });
  const tags = useQuery({
    queryKey: queryKeys.tags,
    queryFn: window.zhixu.tasks.tags,
  });
  const [filters, setFilters] = useState(() => ({
    ...DEFAULT_MEMO_FILTERS,
    view: loadMemoView(DEFAULT_MEMO_FILTERS.view),
  }));
  const [editing, setEditing] = useState<MemoRecord | "new" | null>(null);
  const handledInitialId = useRef<string | null>(null);
  useEffect(() => saveMemoView(filters.view), [filters.view]);
  const remove = useMutation({
    mutationFn: window.zhixu.memos.remove,
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.memos }),
  });
  useEffect(() => {
    if (
      !props.initialSelectedId ||
      !memos.data ||
      handledInitialId.current === props.initialSelectedId
    )
      return;
    const selected = memos.data.find(
      (memo) => memo.id === props.initialSelectedId,
    );
    if (selected) {
      handledInitialId.current = props.initialSelectedId;
      setEditing(selected);
    }
  }, [memos.data, props.initialSelectedId]);
  const workspace = useMemo(
    () => buildMemoWorkspace(memos.data ?? [], filters),
    [memos.data, filters],
  );
  if (memos.isLoading) return <Loading />;
  const categoryMap = new Map(
    (categories.data ?? []).map((item) => [item.id, item]),
  );
  const tagMap = new Map((tags.data ?? []).map((item) => [item.id, item]));

  return (
    <div className="page memos-page">
      <header className="memo-workspace-header">
        <h1>备忘</h1>
        <div>
          <Input
            contentBefore={<Search20Regular />}
            aria-label="搜索备忘"
            placeholder="搜索备忘"
            value={filters.query}
            onChange={(_, data) =>
              setFilters((current) => ({ ...current, query: data.value }))
            }
          />
          <Button
            appearance="primary"
            icon={<Add20Regular />}
            onClick={() => setEditing("new")}
          >
            新建备忘
          </Button>
        </div>
      </header>

      <div className="memo-metrics-grid" aria-label="备忘概览">
        <MemoMetric
          icon={<List20Regular />}
          label="备忘总数"
          value={workspace.metrics.total}
        />
        <MemoMetric
          icon={<Warning20Regular />}
          label="高优先级"
          value={workspace.metrics.high}
          tone="danger"
        />
        <MemoMetric
          icon={<Clock20Regular />}
          label="中优先级"
          value={workspace.metrics.medium}
          tone="warning"
        />
        <MemoMetric
          icon={<Clock20Regular />}
          label="低优先级"
          value={workspace.metrics.low}
        />
        <MemoMetric
          icon={<Folder20Regular />}
          label="使用分类"
          value={workspace.metrics.categories}
        />
        <MemoMetric
          icon={<Tag20Regular />}
          label="使用标签"
          value={workspace.metrics.tags}
        />
      </div>

      <div className="memo-workspace-layout">
        <aside className="memo-filter-rail">
          <div className="memo-filter-scroll">
            <section>
              <h2>快捷视图</h2>
              <nav>
                {memoViews.map((view) => (
                  <button
                    type="button"
                    className={filters.view === view.value ? "active" : ""}
                    key={view.value}
                    onClick={() =>
                      setFilters((current) => ({
                        ...current,
                        view: view.value,
                      }))
                    }
                  >
                    {view.icon}
                    <span>{MEMO_VIEW_LABELS[view.value]}</span>
                    <strong>{workspace.viewCounts[view.value]}</strong>
                  </button>
                ))}
              </nav>
            </section>
            <section>
              <h2>分类</h2>
              <nav>
                <button
                  type="button"
                  className={filters.categoryId === "all" ? "active" : ""}
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      categoryId: "all",
                    }))
                  }
                >
                  <Folder20Regular />
                  <span>全部分类</span>
                  <strong>{workspace.metrics.total}</strong>
                </button>
                {(categories.data ?? [])
                  .filter((item) => !item.isArchived)
                  .map((item) => (
                    <button
                      type="button"
                      className={filters.categoryId === item.id ? "active" : ""}
                      key={item.id}
                      onClick={() =>
                        setFilters((current) => ({
                          ...current,
                          categoryId: item.id,
                        }))
                      }
                    >
                      <Folder20Regular />
                      <span>{item.name}</span>
                      <strong>{workspace.categoryCounts[item.id] ?? 0}</strong>
                    </button>
                  ))}
              </nav>
            </section>
            <section>
              <h2>标签</h2>
              <nav>
                <button
                  type="button"
                  className={filters.tagId === "all" ? "active" : ""}
                  onClick={() =>
                    setFilters((current) => ({ ...current, tagId: "all" }))
                  }
                >
                  <Tag20Regular />
                  <span>全部标签</span>
                  <strong>{workspace.metrics.total}</strong>
                </button>
                {(tags.data ?? [])
                  .filter((item) => !item.isArchived)
                  .map((item) => (
                    <button
                      type="button"
                      className={filters.tagId === item.id ? "active" : ""}
                      key={item.id}
                      onClick={() =>
                        setFilters((current) => ({
                          ...current,
                          tagId: item.id,
                        }))
                      }
                    >
                      <i
                        className="memo-tag-dot"
                        data-tag-tone={tagTone(item.name)}
                      />
                      <span>{item.name}</span>
                      <strong>{workspace.tagCounts[item.id] ?? 0}</strong>
                    </button>
                  ))}
              </nav>
            </section>
          </div>
          <section className="memo-overview">
            <h2>当前视图</h2>
            <dl>
              <div>
                <dt>备忘</dt>
                <dd>{workspace.overview.count}</dd>
              </div>
              <div>
                <dt>高优先级</dt>
                <dd>{workspace.overview.high}</dd>
              </div>
              <div>
                <dt>分类</dt>
                <dd>{workspace.overview.categories}</dd>
              </div>
              <div>
                <dt>标签</dt>
                <dd>{workspace.overview.tags}</dd>
              </div>
            </dl>
          </section>
        </aside>

        <section className="memo-workspace-panel">
          <div className="memo-workspace-toolbar">
            <h2>{MEMO_VIEW_LABELS[filters.view]}</h2>
            <span>{workspace.filtered.length}</span>
          </div>
          <div className="memo-table-scroll">
            {workspace.filtered.length ? (
              <table className="memo-table">
                <thead>
                  <tr>
                    <th>备忘</th>
                    <th>分类</th>
                    <th>优先级</th>
                    <th>标签</th>
                    <th>更新时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {workspace.filtered.map((memo) => {
                    const memoTags = memo.tagIds
                      .map((id) => tagMap.get(id))
                      .filter((tag): tag is TagRecord => Boolean(tag));
                    return (
                      <tr key={memo.id} onDoubleClick={() => setEditing(memo)}>
                        <td className="memo-table-title">
                          <strong>{memo.title}</strong>
                          {memo.descriptionMd ? (
                            <small>{memo.descriptionMd}</small>
                          ) : null}
                        </td>
                        <td>
                          {memo.categoryId
                            ? (categoryMap.get(memo.categoryId)?.name ??
                              "未分类")
                            : "未分类"}
                        </td>
                        <td>
                          <span
                            className={`task-priority priority-${memo.priority}`}
                          >
                            <i />
                            {memo.priority === 3
                              ? "高"
                              : memo.priority === 2
                                ? "中"
                                : "低"}
                          </span>
                        </td>
                        <td>
                          <div className="memo-table-tags">
                            {memoTags.length ? (
                              memoTags.map((tag) => (
                                <span
                                  key={tag.id}
                                  data-tag-tone={tagTone(tag.name)}
                                >
                                  {tag.name}
                                </span>
                              ))
                            ) : (
                              <span className="memo-table-empty">—</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <time>
                            {new Date(memo.updatedAt).toLocaleString("zh-CN", {
                              month: "numeric",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </time>
                        </td>
                        <td>
                          <div className="workspace-row-actions">
                            <Button
                              appearance="subtle"
                              icon={<Edit20Regular />}
                              aria-label={`编辑${memo.title}`}
                              onClick={() => setEditing(memo)}
                            />
                            <Button
                              appearance="subtle"
                              icon={<Delete20Regular />}
                              aria-label={`删除${memo.title}`}
                              onClick={() => {
                                if (confirm(`删除“${memo.title}”？`))
                                  remove.mutate(memo.id);
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <EmptyState
                title={filters.query ? "没有匹配的备忘" : "当前视图暂无备忘"}
                detail={
                  filters.query
                    ? "调整搜索或筛选条件。"
                    : "新建备忘后会显示在这里。"
                }
                action={
                  <Button onClick={() => setEditing("new")}>新建备忘</Button>
                }
              />
            )}
          </div>
        </section>
      </div>
      <MemoEditor
        value={editing}
        categories={categories.data ?? []}
        tags={tags.data ?? []}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function MemoMetric(props: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: "danger" | "warning";
}): React.JSX.Element {
  return (
    <section className={`memo-metric-card ${props.tone ?? ""}`}>
      {props.icon}
      <div>
        <span>{props.label}</span>
        <strong>{props.value}</strong>
      </div>
    </section>
  );
}

function MemoEditor(props: {
  value: MemoRecord | "new" | null;
  categories: CategoryRecord[];
  tags: TagRecord[];
  onClose(): void;
}): React.JSX.Element {
  const client = useQueryClient();
  const record = props.value && props.value !== "new" ? props.value : null;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(1);
  const [categoryId, setCategoryId] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [tagQuery, setTagQuery] = useState("");
  useEffect(() => {
    if (!props.value) return;
    setTitle(record?.title ?? "");
    setDescription(record?.descriptionMd ?? "");
    setPriority(record?.priority ?? 1);
    setCategoryId(record?.categoryId ?? "");
    setTagIds(record?.tagIds ?? []);
    setTagQuery("");
  }, [props.value, record]);
  const save = useMutation({
    mutationFn: (draft: MemoDraft) => window.zhixu.memos.save(draft),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.memos });
      props.onClose();
    },
  });
  const availableTags = props.tags.filter((tag) => !tag.isArchived);
  const selectedTags = tagIds
    .map((id) => availableTags.find((tag) => tag.id === id))
    .filter((tag): tag is TagRecord => Boolean(tag));
  const matchingTags = availableTags.filter(
    (tag) =>
      !tagIds.includes(tag.id) &&
      normalizeTagName(tag.name).includes(normalizeTagName(tagQuery)),
  );
  return (
    <Dialog
      open={props.value !== null}
      onOpenChange={(_, data) => {
        if (!data.open) props.onClose();
      }}
    >
      <DialogSurface className="editor-dialog">
        <DialogBody>
          <DialogTitle>{record ? "编辑备忘" : "新建备忘"}</DialogTitle>
          <DialogContent className="form-grid">
            <Field label="标题" required>
              <Input
                autoFocus
                value={title}
                onChange={(_, data) => setTitle(data.value)}
              />
            </Field>
            <Field label="内容">
              <Textarea
                resize="vertical"
                value={description}
                onChange={(_, data) => setDescription(data.value)}
              />
            </Field>
            <div className="form-row two paired-row">
              <Field label="优先级">
                <Select
                  value={priority}
                  onChange={(event) => setPriority(Number(event.target.value))}
                >
                  <option value={1}>低</option>
                  <option value={2}>中</option>
                  <option value={3}>高</option>
                </Select>
              </Field>
              <Field label="分类">
                <Select
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  <option value="">未分类</option>
                  {props.categories
                    .filter((item) => !item.isArchived)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </Select>
              </Field>
            </div>
            <Field label="标签">
              <TagPicker
                selectedOptions={tagIds}
                onOptionSelect={(_, data) => {
                  setTagIds(data.selectedOptions);
                  setTagQuery("");
                }}
              >
                <TagPickerControl>
                  <TagPickerGroup>
                    {selectedTags.map((tag) => (
                      <Tag
                        key={tag.id}
                        value={tag.id}
                        dismissible
                        data-tag-tone={tagTone(tag.name)}
                      >
                        {tag.name}
                      </Tag>
                    ))}
                  </TagPickerGroup>
                  <TagPickerInput
                    aria-label="搜索标签"
                    placeholder={tagIds.length ? "" : "搜索标签"}
                    value={tagQuery}
                    onChange={(event) => setTagQuery(event.target.value)}
                  />
                </TagPickerControl>
                <TagPickerList>
                  {matchingTags.map((tag) => (
                    <TagPickerOption
                      key={tag.id}
                      value={tag.id}
                      text={tag.name}
                    >
                      {tag.name}
                    </TagPickerOption>
                  ))}
                </TagPickerList>
              </TagPicker>
            </Field>
            {save.error ? (
              <p className="error-message">{String(save.error)}</p>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button onClick={props.onClose}>取消</Button>
            <Button
              appearance="primary"
              disabled={!title.trim() || save.isPending}
              onClick={() =>
                save.mutate({
                  id: record?.id,
                  title: title.trim(),
                  descriptionMd: description.trim() || null,
                  priority,
                  categoryId: categoryId || null,
                  tagIds,
                })
              }
            >
              保存
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
