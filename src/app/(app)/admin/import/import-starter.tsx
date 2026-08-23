"use client";

import { useActionState, useEffect, useState } from "react";
import { Notice } from "@/components/dialog";
import { Button, Field, inputClass, IconUpload, IconCheck } from "@/components/ui";
import {
  fetchDocAction,
  stageImportAction,
  type AdminResult,
} from "@/app/actions/admin";
import { cx } from "@/lib/ui";

type Source = "gdoc" | "paste" | "file";

const SOURCES: { key: Source; label: string; hint: string }[] = [
  {
    key: "gdoc",
    label: "Google Doc link",
    hint: "Pulls the doc directly when link sharing is on.",
  },
  {
    key: "paste",
    label: "Paste the text",
    hint: "Copy the event list and drop it in. Always works.",
  },
  {
    key: "file",
    label: "Upload a file",
    hint: "A .txt or .csv export of the same list.",
  },
];

export function ImportStarter({ defaultUrl }: { defaultUrl: string }) {
  const [source, setSource] = useState<Source>("gdoc");
  const [url, setUrl] = useState(defaultUrl);
  const [content, setContent] = useState("");
  const [fetchState, fetchAction, fetching] = useActionState<
    AdminResult & { text?: string },
    FormData
  >(fetchDocAction, {});
  const [stageState, stageAction, staging] = useActionState<AdminResult, FormData>(
    stageImportAction,
    {},
  );

  // A successful fetch fills the textarea, so the same review step runs either way.
  const [fetched, setFetched] = useState(0);

  useEffect(() => {
    if (fetchState.text) {
      setContent(fetchState.text);
      setSource("paste");
      setFetched(fetchState.text.split("\n").length);
    }
  }, [fetchState.text]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setContent(text);
    setSource("paste");
  }

  const lineCount = content ? content.split("\n").filter((l) => l.trim()).length : 0;

  return (
    <div className="space-y-5">
      {fetched > 0 && (
        <Notice kind="ok">
          Document fetched — {fetched} lines pulled from Google Docs. Review the
          content below, then scan it for events.
        </Notice>
      )}

      {/* Source picker */}
      <div className="grid gap-2 sm:grid-cols-3">
        {SOURCES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSource(s.key)}
            aria-pressed={source === s.key}
            className={cx(
              "rounded-xl px-4 py-3 text-left ring-1 ring-inset transition-all",
              source === s.key
                ? "bg-brand-50 ring-brand-200"
                : "bg-canvas ring-line hover:bg-line",
            )}
          >
            <span
              className={cx(
                "block text-[14px] font-semibold",
                source === s.key ? "text-ink" : "text-body",
              )}
            >
              {s.label}
            </span>
            <span className="mt-0.5 block text-[12px] leading-snug text-slate">
              {s.hint}
            </span>
          </button>
        ))}
      </div>

      {/* Google Doc fetch */}
      {source === "gdoc" && (
        <form action={fetchAction} className="space-y-3">
          {fetchState.error && <Notice kind="error">{fetchState.error}</Notice>}

          <Field
            label="Google Doc URL"
            hint="The doc has to be shared as “Anyone with the link can view”. Otherwise use Paste."
            required
          >
            <input
              name="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://docs.google.com/document/d/…"
              className={inputClass}
            />
          </Field>

          <Button type="submit" variant="secondary" size="md" disabled={fetching}>
            {fetching ? "Fetching…" : "Fetch document"}
          </Button>
        </form>
      )}

      {/* File upload */}
      {source === "file" && (
        <Field
          label="Upload a .txt or .csv export"
          hint="File → Download → Plain text (.txt) in Google Docs."
        >
          <input
            type="file"
            accept=".txt,.csv,.md,text/plain,text/csv"
            onChange={onFile}
            className="block w-full cursor-pointer rounded-xl bg-canvas px-3.5 py-2.5 text-[13.5px] text-body ring-1 ring-inset ring-line
                       file:mr-3 file:rounded-lg file:border-0 file:bg-line file:px-3 file:py-1.5 file:text-[13px] file:font-semibold file:text-ink
                       hover:file:bg-line-strong"
          />
        </Field>
      )}

      {/* The shared review + parse step */}
      <form action={stageAction} className="space-y-4">
        {stageState.error && <Notice kind="error">{stageState.error}</Notice>}

        {/* Only claim a Google Doc source when the content actually came from
            one — otherwise a paste gets filed under the doc's URL. */}
        <input
          type="hidden"
          name="sourceType"
          value={fetched > 0 ? "gdoc" : source === "file" ? "file" : "paste"}
        />
        <input type="hidden" name="url" value={fetched > 0 ? url : ""} />

        <Field
          label="Event list content"
          hint="Either the coverage doc format, or plain sentences like “The Foxtide show is on August 29, 2026 at 6:30 PM at the Heartwood Soundstage.”"
          required
        >
          <textarea
            name="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={14}
            required
            placeholder={`2026\nSEPTEMBER\n9/13\n* The Strokes @ HR (Reporter/Photo: Gleb)\n\n— or written out as sentences —\n\nThe Foxtide show in Gainesville is on Saturday, August 29, 2026,\nat 6:30 PM at the Heartwood Soundstage.`}
            className={cx(inputClass, "resize-y font-mono text-[12.5px] leading-relaxed")}
          />
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Field label="Starting year" className="w-[130px]">
              <input
                name="defaultYear"
                type="number"
                min={2020}
                max={2100}
                defaultValue={new Date().getFullYear()}
                className={inputClass}
              />
            </Field>
            {lineCount > 0 && (
              <span className="mt-5 text-[12.5px] text-slate">
                <IconCheck size={13} className="mr-1 inline text-teal-400" />
                {lineCount} non-empty lines ready
              </span>
            )}
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={staging || !content.trim()}
            className="mt-5"
          >
            <IconUpload size={16} />
            {staging ? "Scanning…" : "Scan for events"}
          </Button>
        </div>

        <p className="text-[12px] leading-relaxed text-slate">
          Both the coverage doc layout and ordinary written-out descriptions work —
          the format is detected for you. Nothing is added to the event database yet. The next step shows a preview
          of everything found, flags duplicates and incomplete entries, and lets you
          edit before anything is imported.
        </p>
      </form>
    </div>
  );
}
