import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Textarea } from "@fluentui/react-components";
import {
  Add20Regular,
  Delete20Regular,
  Eye20Regular,
  Save20Regular,
} from "@fluentui/react-icons";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { NoteRecord } from "../../../preload/api-types";
import { EmptyState, Loading, PageHeader } from "../components/Page";
import { queryKeys } from "../query";

export function NotesPage(props: {
  initialSelectedId?: string | null;
}): React.JSX.Element {
  const client = useQueryClient();
  const notes = useQuery({
    queryKey: queryKeys.notes,
    queryFn: window.zhixu.notes.list,
  });
  const [selectedId, setSelectedId] = useState<string | null>(
    props.initialSelectedId ?? null,
  );
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(false);
  const [preview, setPreview] = useState(false);
  const [dirty, setDirty] = useState(false);
  const selected =
    (notes.data ?? []).find((note) => note.id === selectedId) ?? null;
  useEffect(() => {
    if (props.initialSelectedId) setSelectedId(props.initialSelectedId);
  }, [props.initialSelectedId]);
  useEffect(() => {
    if (
      notes.data?.[0] &&
      (!selectedId || !notes.data.some((note) => note.id === selectedId))
    ) {
      setSelectedId(notes.data[0].id);
    }
  }, [notes.data, selectedId]);
  useEffect(() => {
    if (selected) {
      setTitle(selected.title);
      setContent(selected.contentMd);
      setPinned(selected.isPinned);
      setDirty(false);
    }
  }, [selected?.id]);
  const save = useMutation({
    mutationFn: () =>
      window.zhixu.notes.save({
        id: selected?.id,
        title: title.trim() || "未命名笔记",
        contentMd: content,
        isPinned: pinned,
      }),
    onSuccess: async (id) => {
      setSelectedId(id);
      setDirty(false);
      await client.invalidateQueries({ queryKey: queryKeys.notes });
    },
  });
  const remove = useMutation({
    mutationFn: window.zhixu.notes.remove,
    onSuccess: async () => {
      setSelectedId(null);
      await client.invalidateQueries({ queryKey: queryKeys.notes });
    },
  });
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.ctrlKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (dirty) save.mutate();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dirty, title, content, pinned, selected?.id]);
  if (notes.isLoading) return <Loading />;
  const create = (): void => {
    setSelectedId(null);
    setTitle("");
    setContent("");
    setPinned(false);
    setDirty(true);
    setPreview(false);
  };
  return (
    <div className="page notes-page">
      <PageHeader
        title="笔记"
        actions={
          <Button appearance="primary" icon={<Add20Regular />} onClick={create}>
            新建笔记
          </Button>
        }
      />
      <div className="notes-workspace">
        <aside className="note-list">
          {(notes.data ?? []).map((note) => (
            <button
              type="button"
              className={selectedId === note.id ? "active" : ""}
              key={note.id}
              onClick={() => setSelectedId(note.id)}
            >
              <strong>
                {note.isPinned ? "置顶 · " : ""}
                {note.title}
              </strong>
              <small>{new Date(note.updatedAt).toLocaleString("zh-CN")}</small>
            </button>
          ))}
          {(notes.data ?? []).length === 0 ? (
            <EmptyState title="暂无笔记" detail="创建第一篇 Markdown 笔记。" />
          ) : null}
        </aside>
        <section className="note-editor">
          <div className="note-toolbar">
            <Input
              value={title}
              placeholder="笔记标题"
              onChange={(_, data) => {
                setTitle(data.value);
                setDirty(true);
              }}
            />
            <label className="pin-control">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(event) => {
                  setPinned(event.target.checked);
                  setDirty(true);
                }}
              />
              置顶
            </label>
            <Button
              appearance={preview ? "primary" : "subtle"}
              icon={<Eye20Regular />}
              onClick={() => setPreview(!preview)}
            >
              {preview ? "编辑" : "预览"}
            </Button>
            <Button
              icon={<Save20Regular />}
              appearance="primary"
              disabled={!dirty || save.isPending}
              onClick={() => save.mutate()}
            >
              保存
            </Button>
            {selected ? (
              <Button
                appearance="subtle"
                icon={<Delete20Regular />}
                onClick={() => {
                  if (confirm(`删除“${selected.title}”？`))
                    remove.mutate(selected.id);
                }}
              />
            ) : null}
          </div>
          {preview ? (
            <article className="markdown-preview">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content || "*暂无内容*"}
              </ReactMarkdown>
            </article>
          ) : (
            <Textarea
              className="markdown-editor"
              resize="none"
              value={content}
              placeholder="使用 Markdown 记录内容…"
              onChange={(_, data) => {
                setContent(data.value);
                setDirty(true);
              }}
            />
          )}
        </section>
      </div>
    </div>
  );
}
