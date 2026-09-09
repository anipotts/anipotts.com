import { useEffect, useId, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import {
  TextBIcon,
  TextItalicIcon,
  TextUnderlineIcon,
  LinkIcon,
  ImageIcon,
  ArrowCounterClockwiseIcon,
  ArrowClockwiseIcon,
} from "@phosphor-icons/react";
import {
  inlineImageClass,
  inlinePlainText,
  safeInlineUrl,
} from "@anipotts/content/public/inline";
const publicSiteUrl = import.meta.env.DEV
  ? "http://localhost:4311/"
  : "https://anipotts.com/";
import { inlineDocument, inlineMarkdown } from "../../lib/rich-text";

// Keep a typed suffix inside its link. Arrow-right still lets the writer leave the mark.
const EditorialStarterKit = StarterKit.extend({
  addExtensions() {
    return (this.parent?.() ?? []).map((extension) =>
      extension.name === "link"
        ? extension.extend({ inclusive: true })
        : extension,
    );
  },
});
const InlineImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: (element) => {
          const src = element.getAttribute("src") ?? "";
          return src.startsWith(publicSiteUrl)
            ? "/" + src.slice(publicSiteUrl.length)
            : src;
        },
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "img",
      {
        ...HTMLAttributes,
        src: String(HTMLAttributes.src).startsWith("/")
          ? new URL(HTMLAttributes.src, publicSiteUrl).href
          : HTMLAttributes.src,
        class: inlineImageClass(HTMLAttributes.title),
        title: undefined,
      },
    ];
  },
}).configure({ inline: true, allowBase64: false });

export function RichTextField({
  label,
  description,
  value,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const change = useRef(onChange);
  change.current = onChange;
  const lastValue = useRef(value);
  const [panel, setPanel] = useState<"link" | "image" | null>(null);
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [urlError, setUrlError] = useState("");
  const [editingImage, setEditingImage] = useState(false);
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      EditorialStarterKit.configure({
        heading: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        codeBlock: false,
        horizontalRule: false,
        trailingNode: false,
        link: {
          openOnClick: false,
          autolink: false,
          linkOnPaste: false,
          protocols: ["https"],
          isAllowedUri: (url) => safeInlineUrl(url),
        },
      }),
      InlineImage,
    ],
    content: inlineDocument(value),
    editable: !disabled,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
        "aria-describedby": `${id}-help`,
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor }) => {
      const next = inlineMarkdown(editor.getJSON());
      lastValue.current = next;
      change.current(next);
    },
  });
  useEffect(() => {
    if (editor && value !== lastValue.current) {
      lastValue.current = value;
      editor.commands.setContent(inlineDocument(value), { emitUpdate: false });
    }
  }, [value, editor]);
  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [disabled, editor]);
  function openPanel(next: "link" | "image") {
    if (!editor) return;
    const attrs = editor.getAttributes(next);
    setPanel(next);
    setUrl(attrs[next === "link" ? "href" : "src"] ?? "");
    setAlt(attrs.alt ?? "");
    setUrlError("");
    setEditingImage(editor.isActive("image"));
  }
  const actions = [
    {
      label: "Bold",
      icon: TextBIcon,
      active: "bold",
      run: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      label: "Italic",
      icon: TextItalicIcon,
      active: "italic",
      run: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      label: "Underline",
      icon: TextUnderlineIcon,
      active: "underline",
      run: () => editor?.chain().focus().toggleUnderline().run(),
    },
    {
      label: "Edit link",
      icon: LinkIcon,
      active: "link",
      run: () => openPanel("link"),
    },
    {
      label: "Edit image",
      icon: ImageIcon,
      active: "image",
      run: () => openPanel("image"),
    },
  ];
  return (
    <VStack gap={2} className="rich-field">
      <Text weight="semibold">{label}</Text>
      {description && (
        <Text color="secondary" id={`${id}-help`}>
          {description}
        </Text>
      )}
      <VStack
        gap={0}
        className="rich-field-surface"
        data-disabled={disabled || undefined}
      >
        <HStack
          gap={1}
          wrap="wrap"
          className="rich-toolbar"
          aria-label={`${label} formatting`}
        >
          {actions.map((action) => (
            <Button
              key={action.label}
              label={action.label}
              tooltip={action.label}
              icon={<action.icon size={18} />}
              isIconOnly
              size="sm"
              variant={editor?.isActive(action.active) ? "secondary" : "ghost"}
              aria-pressed={editor?.isActive(action.active) ?? false}
              isDisabled={disabled || !editor}
              onClick={action.run}
            />
          ))}
          <HStack gap={1} className="rich-history-actions">
            <Button
              label="Undo"
              tooltip="Undo"
              icon={<ArrowCounterClockwiseIcon size={18} />}
              isIconOnly
              size="sm"
              variant="ghost"
              isDisabled={disabled || !editor?.can().undo()}
              onClick={() => editor?.chain().focus().undo().run()}
            />
            <Button
              label="Redo"
              tooltip="Redo"
              icon={<ArrowClockwiseIcon size={18} />}
              isIconOnly
              size="sm"
              variant="ghost"
              isDisabled={disabled || !editor?.can().redo()}
              onClick={() => editor?.chain().focus().redo().run()}
            />
          </HStack>
        </HStack>
        <EditorContent editor={editor} className="rich-writing" />
        {panel && (
          <VStack gap={3} className="rich-inspector">
            <Text weight="semibold">
              {panel === "link" ? "Link destination" : "Inline image"}
            </Text>
            <TextInput
              label={panel === "link" ? "Link URL" : "Image URL"}
              value={url}
              onChange={setUrl}
              placeholder={
                panel === "link"
                  ? "https://example.com or /writing/post"
                  : "/images/brand/logo.svg"
              }
              description={
                panel === "link"
                  ? "Edit the wording directly in the writing area. The destination stays attached."
                  : "Use an existing image path or an HTTPS image URL. Select an image in the text to replace it."
              }
            />
            {panel === "image" && (
              <TextInput
                label="Image description"
                value={alt}
                onChange={setAlt}
                description="Describe meaningful images. Leave blank for a logo beside its written name."
              />
            )}
            {urlError && <Text role="alert">{urlError}</Text>}
            <HStack gap={2} wrap="wrap">
              <Button
                label={
                  panel === "link"
                    ? "Apply link"
                    : editingImage
                      ? "Update image"
                      : "Insert image"
                }
                size="sm"
                onClick={() => {
                  if (!editor) return;
                  if (
                    !safeInlineUrl(url, panel === "image") ||
                    /[<>"']/u.test(url)
                  ) {
                    setUrlError(
                      "Use a relative path or a complete HTTPS URL without spaces.",
                    );
                    return;
                  }
                  if (panel === "link") {
                    if (
                      editor.state.selection.empty &&
                      !editor.isActive("link")
                    ) {
                      setUrlError(
                        "Select the words to link in the writing area first.",
                      );
                      return;
                    }
                    editor
                      .chain()
                      .focus()
                      .extendMarkRange("link")
                      .setLink({ href: url })
                      .run();
                  } else if (editingImage)
                    editor
                      .chain()
                      .focus()
                      .updateAttributes("image", { src: url, alt })
                      .run();
                  else editor.chain().focus().setImage({ src: url, alt }).run();
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
              {panel === "image" && editingImage && (
                <Button
                  label="Remove image"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    editor?.chain().focus().deleteSelection().run();
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
      </VStack>
      <Text color="secondary" type="supporting">
        {inlinePlainText(value).length} characters
      </Text>
    </VStack>
  );
}
