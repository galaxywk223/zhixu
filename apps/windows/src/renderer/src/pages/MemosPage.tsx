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
  Delete20Regular,
  Edit20Regular,
  Search20Regular,
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
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<MemoRecord | "new" | null>(null);
  const handledInitialId = useRef<string | null>(null);
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
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    if (!normalized) return memos.data ?? [];
    return (memos.data ?? []).filter((memo) =>
      `${memo.title} ${memo.descriptionMd ?? ""}`
        .toLocaleLowerCase("zh-CN")
        .includes(normalized),
    );
  }, [memos.data, query]);
  if (memos.isLoading) return <Loading />;
  const categoryMap = new Map(
    (categories.data ?? []).map((item) => [item.id, item]),
  );
  const tagMap = new Map((tags.data ?? []).map((item) => [item.id, item]));
  return (
    <div className="page memos-page">
      <header className="memo-header">
        <h1>备忘</h1>
        <div>
          <Input
            contentBefore={<Search20Regular />}
            aria-label="搜索备忘"
            placeholder="搜索备忘"
            value={query}
            onChange={(_, data) => setQuery(data.value)}
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
      {filtered.length === 0 ? (
        <EmptyState
          title={query ? "没有匹配的备忘" : "暂无备忘"}
          detail={query ? "调整搜索内容。" : "记录不需要安排日期的事项。"}
          action={
            query ? undefined : (
              <Button onClick={() => setEditing("new")}>新建备忘</Button>
            )
          }
        />
      ) : (
        <div className="memo-list">
          {filtered.map((memo) => {
            const memoTags = memo.tagIds
              .map((id) => tagMap.get(id))
              .filter((tag): tag is TagRecord => Boolean(tag));
            return (
              <article className="memo-row" key={memo.id}>
                <button
                  type="button"
                  className="memo-row-main"
                  onClick={() => setEditing(memo)}
                >
                  <strong>{memo.title}</strong>
                  {memo.descriptionMd ? <p>{memo.descriptionMd}</p> : null}
                  <span className="memo-meta">
                    {memo.categoryId
                      ? (categoryMap.get(memo.categoryId)?.name ?? "未分类")
                      : "未分类"}
                    <time>
                      {new Date(memo.updatedAt).toLocaleString("zh-CN", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </span>
                  {memoTags.length ? (
                    <span className="memo-tags">
                      {memoTags.map((tag) => (
                        <span key={tag.id} data-tag-tone={tagTone(tag.name)}>
                          {tag.name}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </button>
                <div className="memo-actions">
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
              </article>
            );
          })}
        </div>
      )}
      <MemoEditor
        value={editing}
        categories={categories.data ?? []}
        tags={tags.data ?? []}
        onClose={() => setEditing(null)}
      />
    </div>
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
  const [categoryId, setCategoryId] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [tagQuery, setTagQuery] = useState("");
  useEffect(() => {
    if (!props.value) return;
    setTitle(record?.title ?? "");
    setDescription(record?.descriptionMd ?? "");
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
                  descriptionMd: description || null,
                  categoryId: categoryId || null,
                  tagIds,
                })
              }
            >
              {save.isPending ? "保存中" : "保存"}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
