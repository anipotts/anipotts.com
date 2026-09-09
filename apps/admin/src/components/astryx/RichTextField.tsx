import { useEffect, useId, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Field } from "@astryxdesign/core/Field";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import {
  ToggleButton,
  ToggleButtonGroup,
} from "@astryxdesign/core/ToggleButton";
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
  validationError,
  value,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  validationError?: string;
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
        id,
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
        "aria-describedby": description ? `${id}-help` : "",
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
    editor?.setOptions({
      editorProps: {
        attributes: {
          id,
          role: "textbox",
          "aria-label": label,
          "aria-multiline": "true",
          spellcheck: "true",
          "aria-invalid": validationError ? "true" : "false",
          "aria-describedby": [
            description ? `${id}-help` : "",
            validationError ? `${id}-error` : "",
          ]
            .filter(Boolean)
            .join(" "),
        },
      },
    });
  }, [disabled, editor, id, label, description, validationError]);
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
      <Field
        label={label}
        inputID={id}
        description={description}
        descriptionID={`${id}-help`}
        isDisabled={disabled}
        status={
          validationError
            ? {
                type: "error",
                message: validationError,
                messageID: `${id}-error`,
              }
            : undefined
        }
        statusVariant="detached"
      >
        <VStack
          gap={0}
          className="rich-field-surface"
          data-disabled={disabled || undefined}
        >
          <Toolbar
            label={`${label} formatting`}
            size="sm"
            startContent={
              <HStack gap={1} wrap="wrap" className="rich-toolbar">
                <ToggleButtonGroup
                  label="Text style"
                  type="multiple"
                  size="sm"
                  isDisabled={disabled || !editor}
                  value={actions
                    .slice(0, 3)
                    .filter((action) => editor?.isActive(action.active))
                    .map((action) => action.active)}
                  onChange={(next) => {
                    const changed = actions
                      .slice(0, 3)
                      .find(
                        (action) =>
                          next.includes(action.active) !==
                          Boolean(editor?.isActive(action.active)),
                      );
                    changed?.run();
                  }}
                >
                  {actions.slice(0, 3).map((action) => (
                    <ToggleButton
                      isIconOnly
                      key={action.active}
                      value={action.active}
                      label={action.label}
                      icon={<action.icon size={18} />}
                    />
                  ))}
                </ToggleButtonGroup>
                {actions.slice(3).map((action) => (
                  <Button
                    key={action.active}
                    label={action.label}
                    tooltip={action.label}
                    icon={<action.icon size={18} />}
                    isIconOnly
                    variant="ghost"
                    isDisabled={disabled || !editor}
                    onClick={action.run}
                  />
                ))}
                <Button
                  label="Undo"
                  tooltip="Undo"
                  icon={<ArrowCounterClockwiseIcon size={18} />}
                  isIconOnly
                  variant="ghost"
                  isDisabled={disabled || !editor?.can().undo()}
                  onClick={() => editor?.chain().focus().undo().run()}
                />
                <Button
                  label="Redo"
                  tooltip="Redo"
                  icon={<ArrowClockwiseIcon size={18} />}
                  isIconOnly
                  variant="ghost"
                  isDisabled={disabled || !editor?.can().redo()}
                  onClick={() => editor?.chain().focus().redo().run()}
                />
              </HStack>
            }
          />
          <EditorContent editor={editor} className="rich-writing" />
          {panel && (
            <VStack gap={3} className="rich-inspector">
              <Text weight="semibold">
                {panel === "link" ? "Link destination" : "Inline image"}
              </Text>
              <FormLayout>
                <TextInput
                  status={
                    urlError ? { type: "error", message: urlError } : undefined
                  }
                  statusVariant="detached"
                  label={panel === "link" ? "Link URL" : "Image URL"}
                  value={url}
                  onChange={(next) => {
                    setUrl(next);
                    setUrlError("");
                  }}
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
              </FormLayout>
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
                    else
                      editor.chain().focus().setImage({ src: url, alt }).run();
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
      </Field>
    </VStack>
  );
}
