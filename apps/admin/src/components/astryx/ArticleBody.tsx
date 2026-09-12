import { EditorSelectionBookmark } from "../../lib/editor-selection-bookmark";
import { SelectionOverlay } from "./SelectionOverlay";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  CommandPalette,
  CommandPaletteInput,
} from "@astryxdesign/core/CommandPalette";
import { createStaticSource } from "@astryxdesign/core/Typeahead";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { TextSelection, NodeSelection } from "@tiptap/pm/state";
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
  const [focused, setFocused] = useState(false);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [formatting, setFormatting] = useState(false);
  const [panelGeneration, setPanelGeneration] = useState(0);
  const [incomingImage, setIncomingImage] = useState<File | null>(null);
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
        if (event.key === "Escape") setFormatting(false);
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
            image:
              editor.state.selection instanceof NodeSelection &&
              editor.state.selection.node.type.name === "image",
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
    setPanelGeneration((current) => current + 1);
    const attrs =
      next === "image" && !selectedImage ? {} : editor.getAttributes(next);
    setUrl(String(attrs[next === "link" ? "href" : "src"] ?? ""));
    setAlt(String(attrs.alt ?? ""));
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
      if (
        selection instanceof NodeSelection &&
        selection.node.type.name === "image"
      )
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
    <Field label="Article body" inputID={id} isLabelHidden>
      <VStack
        gap={0}
        className="article-composer"
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setFocused(false);
        }}
      >
        <HStack gap={2} wrap="wrap">
          <Button
            isDisabled={disabled}
            label="Format and insert"
            size="sm"
            variant="ghost"
            onClick={() => setFormatting(!formatting)}
          />
          {selectedImage && focused && (
            <>
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
            </>
          )}
        </HStack>
        {editor && !panel && (
          <BubbleMenu
            editor={editor}
            options={{ placement: "top", offset: 8 }}
            shouldShow={({ editor, state }) =>
              (editor.isFocused ||
                Boolean(
                  document.activeElement?.closest(
                    ".document-selection-toolbar",
                  ),
                )) &&
              !disabled &&
              !panel &&
              !formatting &&
              !state.selection.empty &&
              !editor.isActive("image")
            }
          >
            <HStack
              gap={1}
              className="document-selection-toolbar"
              role="toolbar"
              aria-label="Selected text formatting"
            >
              {format.slice(0, 2).map((item) => (
                <Button
                  key={item.name}
                  label={item.label}
                  tooltip={item.label}
                  icon={item.icon}
                  size="sm"
                  variant="ghost"
                  onClick={item.run}
                />
              ))}
              <Button
                label="Link"
                icon={<LinkIcon />}
                size="sm"
                variant="ghost"
                onClick={() => open("link")}
              />
            </HStack>
          </BubbleMenu>
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
        {(formatting || panel === "image") && (
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
        )}
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
                  existingSrc={
                    imageMode === "crop"
                      ? String(editor?.getAttributes("image").src ?? "")
                      : undefined
                  }
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
                      ? selectedImage
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
