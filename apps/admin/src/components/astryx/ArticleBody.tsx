import { EditorSelectionBookmark } from "../../lib/editor-selection-bookmark";
import { SelectionOverlay } from "./SelectionOverlay";
import {
  CommandPalette,
  CommandPaletteInput,
} from "@astryxdesign/core/CommandPalette";
import { createStaticSource } from "@astryxdesign/core/Typeahead";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { TextSelection, NodeSelection, type Selection } from "@tiptap/pm/state";
import {
  articleExtensions,
  needsMarkdownEditor,
} from "../../lib/article-markdown";
import { Markdown } from "@tiptap/markdown";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
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

const imageSelection = (selection: Selection): selection is NodeSelection =>
  selection instanceof NodeSelection && selection.node.type.name === "image";

const insertionSource = createStaticSource([
  { id: "paragraph", label: "Paragraph" },
  { id: "heading", label: "Heading" },
  { id: "bulletList", label: "Bullet list" },
  { id: "orderedList", label: "Numbered list" },
  { id: "blockquote", label: "Quote" },
  { id: "image", label: "Image" },
  { id: "link", label: "Link" },
]);

export function ArticleBody({
  value,
  onChange,
  disabled,
  resetGeneration = 0,
  flushRef,
  onDirty,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  resetGeneration?: number;
  flushRef?: RefObject<(() => void) | null>;
  onDirty?: () => void;
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
    <VisualArticleBody
      value={value}
      onChange={onChange}
      disabled={disabled}
      resetGeneration={resetGeneration}
      flushRef={flushRef}
      onDirty={onDirty}
    />
  );
}

function VisualArticleBody({
  value,
  onChange,
  disabled,
  resetGeneration = 0,
  flushRef,
  onDirty,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  resetGeneration?: number;
  flushRef?: RefObject<(() => void) | null>;
  onDirty?: () => void;
}) {
  const id = useId();
  const panelSelection = useRef(new EditorSelectionBookmark());
  const lastValue = useRef(value);
  const lastReset = useRef(resetGeneration);
  const change = useRef(onChange);
  change.current = onChange;
  const dirty = useRef(false);
  const dirtyCallback = useRef(onDirty);
  dirtyCallback.current = onDirty;
  const [panel, setPanel] = useState<"link" | "image" | null>(null);
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [error, setError] = useState("");
  const [imageMode, setImageMode] = useState<
    "insert" | "replace" | "crop" | "alt"
  >("insert");
  const [imagePending, setImagePending] = useState(false);
  const [cropSrc, setCropSrc] = useState("");
  const [focused, setFocused] = useState(false);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [panelGeneration, setPanelGeneration] = useState(0);
  const [incomingImage, setIncomingImage] = useState<File | null>(null);
  /** Whether the panel's opening target is an image, not the live selection. */
  const [updatingImage, setUpdatingImage] = useState(false);
  const urlInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (panel === "link") urlInput.current?.focus();
  }, [panel]);
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    extensions: [...articleExtensions(), Markdown],
    content: value,
    contentType: "markdown",
    editable: !disabled,
    editorProps: {
      handleKeyDown: (_view, event) => {
        if (!_view.editable || event.isComposing) return false;
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "k"
        ) {
          event.preventDefault();
          event.stopPropagation();
          open("link");
          return true;
        }
        if (
          event.key === "/" &&
          _view.state.selection.$from.parent.textContent === ""
        ) {
          event.preventDefault();
          setCommandsOpen(true);
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        if (!_view.editable) return false;
        const file = Array.from(event.clipboardData?.files ?? []).find((file) =>
          file.type.startsWith("image/"),
        );
        if (!file) return false;
        event.preventDefault();
        panelSelection.current.capture(_view.state.selection);
        setUpdatingImage(imageSelection(_view.state.selection));
        setPanelGeneration((current) => current + 1);
        setImageMode("insert");
        setUrl("");
        setAlt("");
        setError("");
        setIncomingImage(file);
        setPanel("image");
        return true;
      },
      handleDrop: (view, event) => {
        if (!view.editable) return false;
        const file = Array.from(event.dataTransfer?.files ?? []).find((file) =>
          file.type.startsWith("image/"),
        );
        if (!file) return false;
        event.preventDefault();
        const point = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        });
        if (point)
          view.dispatch(
            view.state.tr.setSelection(
              TextSelection.near(view.state.doc.resolve(point.pos)),
            ),
          );
        panelSelection.current.capture(view.state.selection);
        setUpdatingImage(imageSelection(view.state.selection));
        setPanelGeneration((current) => current + 1);
        setImageMode("insert");
        setUrl("");
        setAlt("");
        setError("");
        setIncomingImage(file);
        setPanel("image");
        return true;
      },
      attributes: {
        id,
        role: "textbox",
        "aria-label": "Article body",
        "aria-multiline": "true",
        spellcheck: "true",
      },
    },
    onTransaction: ({ transaction }) => panelSelection.current.map(transaction),
    onUpdate: ({ editor }) => {
      if (dirtyCallback.current && flushRef) {
        dirty.current = true;
        dirtyCallback.current();
      } else {
        const next = editor.getMarkdown();
        lastValue.current = next;
        change.current(next);
      }
    },
  });
  const toolbarState = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor
        ? {
            image: imageSelection(editor.state.selection),
            bold: editor.isActive("bold"),
            italic: editor.isActive("italic"),
            heading: editor.isActive("heading"),
            bulletList: editor.isActive("bulletList"),
            orderedList: editor.isActive("orderedList"),
            blockquote: editor.isActive("blockquote"),
            undo: editor.can().undo(),
            redo: editor.can().redo(),
          }
        : null,
  });
  const selectedImage = toolbarState?.image ?? false;
  useEffect(() => {
    if (!flushRef || !editor) return;
    const flush = () => {
      if (!dirty.current) return;
      dirty.current = false;
      const next = editor.getMarkdown();
      lastValue.current = next;
      change.current(next);
    };
    flushRef.current = flush;
    return () => {
      flush();
      if (flushRef.current === flush) flushRef.current = null;
    };
  }, [editor, flushRef]);
  useEffect(() => {
    if (
      editor &&
      (value !== lastValue.current || resetGeneration !== lastReset.current)
    ) {
      lastReset.current = resetGeneration;
      dirty.current = false;
      lastValue.current = value;
      editor.commands.setContent(value, {
        contentType: "markdown",
        emitUpdate: false,
      });
    }
  }, [value, editor, resetGeneration]);
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
  function open(
    next: "link" | "image",
    mode: "insert" | "replace" | "crop" | "alt" = "insert",
  ) {
    if (!editor) return;
    panelSelection.current.capture(editor.state.selection);
    setUpdatingImage(imageSelection(editor.state.selection));
    setPanelGeneration((current) => current + 1);
    const attrs =
      next === "image" && !selectedImage ? {} : editor.getAttributes(next);
    setUrl(String(attrs[next === "link" ? "href" : "src"] ?? ""));
    setAlt(String(attrs.alt ?? ""));
    // The crop source belongs to the opening target, like the bookmark above.
    setCropSrc(mode === "crop" ? String(attrs.src ?? "") : "");
    setError("");
    setIncomingImage(null);
    setImageMode(mode);
    setPanel(next);
  }
  function applyPanel() {
    if (disabled || imagePending) return;
    const href = url.trim();
    if (!safeInlineUrl(href, panel === "image") || !href) {
      setError("Enter a valid HTTPS address or site path.");
      return;
    }
    if (!editor) return;
    const selection = panelSelection.current.resolve(editor.state.doc);
    if (!selection) {
      setError(
        "This editing target was removed. Cancel and select a new position.",
      );
      return;
    }
    editor.view.dispatch(editor.state.tr.setSelection(selection));
    if (panel === "image") {
      if (imageSelection(selection))
        editor
          .chain()
          .focus()
          .updateAttributes("image", { src: href, alt })
          .run();
      else editor?.chain().focus().setImage({ src: href, alt }).run();
    } else if (editor?.state.selection.empty && !editor.isActive("link"))
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
      editor?.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setIncomingImage(null);
    setPanel(null);
  }
  return (
    <Field label="Article body" inputID={id}>
      <VStack
        gap={0}
        className="article-composer"
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setFocused(false);
        }}
      >
        <Toolbar
          label="Article formatting"
          size="sm"
          className="document-editor-toolbar"
          startContent={
            <HStack gap={1} wrap="wrap" className="editor-toolbar-controls">
              <DropdownMenu
                button={{
                  label: "Style",
                  variant: "ghost",
                  isDisabled: disabled || !editor,
                }}
                items={[
                  {
                    label: "Paragraph",
                    onClick: () => editor?.chain().focus().setParagraph().run(),
                  },
                  {
                    label: "Heading",
                    icon: <TextHOneIcon />,
                    onClick: () =>
                      editor?.chain().focus().setHeading({ level: 2 }).run(),
                  },
                ]}
              />
              <HStack gap={1} className="editor-toolbar-group">
                <ToggleButtonGroup
                  label="Text style"
                  type="multiple"
                  isDisabled={disabled || !editor}
                  value={format
                    .slice(0, 2)
                    .filter((item) => editor?.isActive(item.name))
                    .map((item) => item.name)}
                  onChange={(values) => {
                    const changed = format
                      .slice(0, 2)
                      .find(
                        (item) =>
                          values.includes(item.name) !==
                          Boolean(editor?.isActive(item.name)),
                      );
                    changed?.run();
                  }}
                >
                  {format.slice(0, 2).map((item) => (
                    <ToggleButton
                      key={item.name}
                      value={item.name}
                      label={item.label}
                      tooltip={item.label}
                      icon={item.icon}
                      isIconOnly
                      isDisabled={disabled || !editor}
                      onMouseDown={(event) => event.preventDefault()}
                    />
                  ))}
                </ToggleButtonGroup>
              </HStack>
              <Button
                label="Link"
                tooltip="Link"
                icon={<LinkIcon />}
                isIconOnly
                variant="ghost"
                isDisabled={disabled || !editor}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => open("link")}
              />
              <DropdownMenu
                button={{
                  label: "Insert",
                  variant: "ghost",
                  isDisabled: disabled || !editor,
                }}
                items={[
                  {
                    label: "Image",
                    icon: <ImageIcon />,
                    onClick: () => open("image"),
                  },
                  ...format.slice(3).map((item) => ({
                    label: item.label,
                    icon: item.icon,
                    endContent: editor?.isActive(item.name) ? (
                      <Text type="supporting">On</Text>
                    ) : undefined,
                    onClick: item.run,
                  })),
                ]}
              />
              <HStack gap={1} className="editor-toolbar-group">
                <Button
                  label="Undo"
                  tooltip="Undo"
                  icon={<ArrowCounterClockwiseIcon />}
                  isIconOnly
                  variant="ghost"
                  isDisabled={disabled || !toolbarState?.undo}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => editor?.chain().focus().undo().run()}
                />
                <Button
                  label="Redo"
                  tooltip="Redo"
                  icon={<ArrowClockwiseIcon />}
                  isIconOnly
                  variant="ghost"
                  isDisabled={disabled || !toolbarState?.redo}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => editor?.chain().focus().redo().run()}
                />
              </HStack>
            </HStack>
          }
        />
        {selectedImage && focused && (
          <HStack
            gap={2}
            wrap="wrap"
            className="article-image-actions"
            role="group"
            aria-label="Selected image"
          >
            <Button
              isDisabled={disabled}
              label="Replace image"
              size="sm"
              variant="ghost"
              onClick={() => open("image", "replace")}
            />
            <Button
              label="Crop image"
              size="sm"
              variant="ghost"
              isDisabled={disabled}
              onClick={() => open("image", "crop")}
            />
            <Button
              label="Alt text"
              size="sm"
              variant="ghost"
              isDisabled={disabled}
              onClick={() => open("image", "alt")}
            />
            <Button
              label="View full size"
              size="sm"
              variant="ghost"
              href={editorialImagePreview(
                String(editor?.getAttributes("image").src ?? ""),
              )}
              target="_blank"
            />
            <Button
              isDisabled={disabled}
              label="Remove image"
              size="sm"
              variant="ghost"
              onClick={() => editor?.chain().focus().deleteSelection().run()}
            />
          </HStack>
        )}
        <CommandPalette
          isOpen={commandsOpen}
          onOpenChange={(next) => {
            setCommandsOpen(next);
            if (!next) {
              setCommandQuery("");
              editor?.commands.focus();
            }
          }}
          label="Insert into article"
          searchSource={insertionSource}
          input={
            <CommandPaletteInput
              value={commandQuery}
              onChange={(event) => setCommandQuery(event.currentTarget.value)}
              placeholder="Insert a block…"
            />
          }
          width="min(420px, calc(100vw - 32px))"
          onValueChange={(id) => {
            setCommandsOpen(false);
            setCommandQuery("");
            if (disabled) return;
            if (id === "image" || id === "link") open(id);
            else if (id === "paragraph")
              editor?.chain().focus().setParagraph().run();
            else format.find((item) => item.name === id)?.run();
          }}
        />
        {panel && (
          <SelectionOverlay
            editor={editor}
            enabled={panel === "link"}
            onClose={() => setPanel(null)}
            onApply={applyPanel}
          >
            <VStack
              gap={3}
              padding={4}
              onKeyDown={(event) => {
                if (
                  panel === "image" &&
                  event.key === "Escape" &&
                  !event.nativeEvent.isComposing &&
                  event.nativeEvent.keyCode !== 229 &&
                  !event.defaultPrevented &&
                  !imagePending
                ) {
                  event.preventDefault();
                  event.stopPropagation();
                  setIncomingImage(null);
                  setPanel(null);
                  editor?.commands.focus();
                }
              }}
            >
              {panel === "image" && imageMode !== "alt" && (
                <ArticleImageUpload
                  key={panelGeneration}
                  existingSrc={imageMode === "crop" ? cropSrc : undefined}
                  startCropping={imageMode === "crop"}
                  initialFile={incomingImage}
                  onPendingChange={setImagePending}
                  disabled={disabled}
                  onUploaded={(src) => {
                    setUrl(src);
                    setError("");
                  }}
                />
              )}
              {panel === "image" &&
                !imagePending &&
                safeInlineUrl(url, true) && (
                  <img
                    className="article-image-preview"
                    src={editorialImagePreview(url)}
                    alt={alt}
                  />
                )}
              <FormLayout>
                {imageMode !== "alt" || panel !== "image" ? (
                  <TextInput
                    isDisabled={disabled || imagePending}
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
                    status={
                      error ? { type: "error", message: error } : undefined
                    }
                  />
                ) : null}
                {panel === "image" && (
                  <TextInput
                    isDisabled={disabled}
                    label="Alt text"
                    value={alt}
                    onChange={setAlt}
                    description="Describe what the image shows for readers using a screen reader."
                  />
                )}
              </FormLayout>
              <HStack gap={2} wrap="wrap">
                <Button
                  label={
                    panel === "image"
                      ? updatingImage
                        ? "Update image"
                        : "Insert image"
                      : "Apply link"
                  }
                  isDisabled={disabled || imagePending}
                  size="sm"
                  variant="primary"
                  type={panel === "link" ? "submit" : "button"}
                  onClick={panel === "link" ? undefined : applyPanel}
                />
                {panel === "link" && editor?.isActive("link") && (
                  <Button
                    label="Remove link"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (disabled) return;
                      const selection = panelSelection.current.resolve(
                        editor.state.doc,
                      );
                      if (!selection) return;
                      editor.view.dispatch(
                        editor.state.tr.setSelection(selection),
                      );
                      editor
                        .chain()
                        .focus()
                        .extendMarkRange("link")
                        .unsetLink()
                        .run();
                      setIncomingImage(null);
                      setPanel(null);
                    }}
                  />
                )}
                <Button
                  label="Cancel"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIncomingImage(null);
                    setPanel(null);
                    editor?.commands.focus();
                  }}
                />
              </HStack>
            </VStack>
          </SelectionOverlay>
        )}
        <EditorContent editor={editor} />
      </VStack>
      <Text color="secondary" type="supporting">
        {value.trim() ? value.trim().split(/\s+/u).length : 0} words
      </Text>
    </Field>
  );
}
