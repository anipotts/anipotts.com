import { useEffect, useId, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import {
  articleExtensions,
  needsMarkdownEditor,
} from "../../lib/article-markdown";
import { Markdown } from "@tiptap/markdown";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Text } from "@astryxdesign/core/Text";
import { Field } from "@astryxdesign/core/Field";
import { Banner } from "@astryxdesign/core/Banner";
import {
  ToggleButton,
  ToggleButtonGroup,
} from "@astryxdesign/core/ToggleButton";
import {
  TextBIcon,
  TextItalicIcon,
  ListBulletsIcon,
  ListNumbersIcon,
  QuotesIcon,
  LinkIcon,
  ImageIcon,
  TextHOneIcon,
  ArrowCounterClockwiseIcon,
  ArrowClockwiseIcon,
} from "@phosphor-icons/react";
import { safeInlineUrl } from "@anipotts/content/public/inline";
import { ArticleImageUpload } from "./ArticleImageUpload";
import { editorialImagePreview } from "../../lib/editorial-media";

export function ArticleBody({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return needsMarkdownEditor(value) ? (
    <VStack gap={3}>
      <Banner
        status="info"
        title="This article includes advanced formatting"
        description="Edit its Markdown here to preserve HTML, tables and embedded media. Preview shows the result."
      />
      <TextArea
        label="Article body"
        value={value}
        onChange={onChange}
        rows={20}
        isDisabled={disabled}
      />
    </VStack>
  ) : (
    <VisualArticleBody value={value} onChange={onChange} disabled={disabled} />
  );
}

function VisualArticleBody({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const lastValue = useRef(value);
  const change = useRef(onChange);
  change.current = onChange;
  const [panel, setPanel] = useState<"link" | "image" | null>(null);
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [error, setError] = useState("");
  const [imagePending, setImagePending] = useState(false);
  const urlInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (panel === "link") urlInput.current?.focus();
  }, [panel]);
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [...articleExtensions(), Markdown],
    content: value,
    contentType: "markdown",
    editable: !disabled,
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-label": "Article body",
        "aria-multiline": "true",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor }) => {
      const next = editor.getMarkdown();
      lastValue.current = next;
      change.current(next);
    },
  });
  useEffect(() => {
    if (editor && value !== lastValue.current) {
      lastValue.current = value;
      editor.commands.setContent(value, {
        contentType: "markdown",
        emitUpdate: false,
      });
    }
  }, [value, editor]);
  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);
  const format = [
    {
      name: "bold",
      label: "Bold",
      icon: <TextBIcon />,
      run: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      name: "italic",
      label: "Italic",
      icon: <TextItalicIcon />,
      run: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      name: "heading",
      label: "Heading",
      icon: <TextHOneIcon />,
      run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      name: "bulletList",
      label: "Bullet list",
      icon: <ListBulletsIcon />,
      run: () => editor?.chain().focus().toggleBulletList().run(),
    },
    {
      name: "orderedList",
      label: "Numbered list",
      icon: <ListNumbersIcon />,
      run: () => editor?.chain().focus().toggleOrderedList().run(),
    },
    {
      name: "blockquote",
      label: "Quote",
      icon: <QuotesIcon />,
      run: () => editor?.chain().focus().toggleBlockquote().run(),
    },
  ];
  function open(next: "link" | "image") {
    if (!editor) return;
    const attrs = editor.getAttributes(next);
    setUrl(String(attrs[next === "link" ? "href" : "src"] ?? ""));
    setAlt(String(attrs.alt ?? ""));
    setError("");
    setPanel(next);
  }
  return (
    <Field label="Article body" inputID={id}>
      <VStack gap={0} className="article-composer">
        <Toolbar
          label="Article formatting"
          size="sm"
          startContent={
            <HStack gap={1} wrap="wrap">
              <ToggleButtonGroup
                label="Block and text formatting"
                type="multiple"
                value={format
                  .filter((item) => editor?.isActive(item.name))
                  .map((item) => item.name)}
                onChange={(values) => {
                  const changed = format.find(
                    (item) =>
                      values.includes(item.name) !==
                      Boolean(editor?.isActive(item.name)),
                  );
                  changed?.run();
                }}
              >
                {format.map((item) => (
                  <ToggleButton
                    key={item.name}
                    value={item.name}
                    label={item.label}
                    tooltip={item.label}
                    icon={item.icon}
                    isIconOnly
                    isDisabled={disabled || !editor}
                  />
                ))}
              </ToggleButtonGroup>
              <Button
                label="Link"
                icon={<LinkIcon />}
                size="sm"
                variant="ghost"
                isDisabled={disabled || !editor}
                onClick={() => open("link")}
              />
              <Button
                label="Image"
                icon={<ImageIcon />}
                size="sm"
                variant="ghost"
                isDisabled={disabled || !editor}
                onClick={() => open("image")}
              />
              <Button
                label="Undo"
                icon={<ArrowCounterClockwiseIcon />}
                size="sm"
                variant="ghost"
                isDisabled={disabled || !editor?.can().undo()}
                onClick={() => editor?.chain().focus().undo().run()}
              />
              <Button
                label="Redo"
                icon={<ArrowClockwiseIcon />}
                size="sm"
                variant="ghost"
                isDisabled={disabled || !editor?.can().redo()}
                onClick={() => editor?.chain().focus().redo().run()}
              />
            </HStack>
          }
        />
        {panel && (
          <VStack
            gap={3}
            padding={4}
            onKeyDown={(event) => {
              if (
                event.key === "Escape" &&
                !event.defaultPrevented &&
                !imagePending
              ) {
                event.preventDefault();
                event.stopPropagation();
                setPanel(null);
                editor?.commands.focus();
              }
            }}
          >
            {panel === "image" && (
              <ArticleImageUpload
                onPendingChange={setImagePending}
                disabled={disabled}
                onUploaded={(src) => {
                  setUrl(src);
                  setError("");
                }}
              />
            )}
            {panel === "image" && !imagePending && safeInlineUrl(url, true) && (
              <img
                className="article-image-preview"
                src={editorialImagePreview(url)}
                alt={alt}
              />
            )}
            <FormLayout>
              <TextInput
                ref={urlInput}
                label={panel === "image" ? "Image URL" : "Link URL"}
                value={url}
                onChange={(v) => {
                  setUrl(v);
                  setError("");
                }}
                description={
                  panel === "image"
                    ? "Use an existing image’s HTTPS address or site image path."
                    : undefined
                }
                status={error ? { type: "error", message: error } : undefined}
              />
              {panel === "image" && (
                <TextInput
                  label="Image description"
                  value={alt}
                  onChange={setAlt}
                  description="Describe what the image shows for readers using a screen reader."
                />
              )}
            </FormLayout>
            <HStack gap={2}>
              <Button
                label={
                  panel === "image"
                    ? editor?.isActive("image")
                      ? "Update image"
                      : "Insert image"
                    : "Apply link"
                }
                isDisabled={disabled || imagePending}
                size="sm"
                variant="primary"
                onClick={() => {
                  const href = url.trim();
                  if (!safeInlineUrl(href, panel === "image") || !href) {
                    setError("Enter a valid HTTPS address or site path.");
                    return;
                  }
                  if (panel === "image") {
                    if (editor?.isActive("image"))
                      editor
                        .chain()
                        .focus()
                        .updateAttributes("image", { src: href, alt })
                        .run();
                    else
                      editor
                        ?.chain()
                        .focus()
                        .setImage({ src: href, alt })
                        .run();
                  } else if (
                    editor?.state.selection.empty &&
                    !editor.isActive("link")
                  )
                    editor
                      .chain()
                      .focus()
                      .insertContent({
                        type: "text",
                        text: href,
                        marks: [{ type: "link", attrs: { href } }],
                      })
                      .run();
                  else
                    editor
                      ?.chain()
                      .focus()
                      .extendMarkRange("link")
                      .setLink({ href })
                      .run();
                  setPanel(null);
                }}
              />
              {panel === "link" && editor?.isActive("link") && (
                <Button
                  label="Remove link"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    editor
                      .chain()
                      .focus()
                      .extendMarkRange("link")
                      .unsetLink()
                      .run();
                    setPanel(null);
                  }}
                />
              )}
              <Button
                label="Cancel"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setPanel(null);
                  editor?.commands.focus();
                }}
              />
            </HStack>
          </VStack>
        )}
        <EditorContent editor={editor} />
      </VStack>
      <Text color="secondary" type="supporting">
        {value.trim() ? value.trim().split(/\s+/u).length : 0} words
      </Text>
    </Field>
  );
}
