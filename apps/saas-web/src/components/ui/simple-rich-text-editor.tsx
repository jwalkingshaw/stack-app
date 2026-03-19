"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type MutableRefObject } from "react";
import { $generateHtmlFromNodes, $generateNodesFromDOM } from "@lexical/html";
import { $isLinkNode, AutoLinkNode, LinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode,
  ListNode,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $setBlocksType } from "@lexical/selection";
import { $createHeadingNode, $isHeadingNode, HeadingNode } from "@lexical/rich-text";
import {
  $createParagraphNode,
  $isElementNode,
  $isRootOrShadowRoot,
  $isTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  CAN_REDO_COMMAND,
  COMMAND_PRIORITY_HIGH,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_LOW,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  INDENT_CONTENT_COMMAND,
  OUTDENT_CONTENT_COMMAND,
  PASTE_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
  type LexicalNode,
  type LexicalEditor,
} from "lexical";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  RemoveFormatting,
  Redo2,
  RotateCcw,
  Underline,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SimpleRichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minHeightClassName?: string;
  stripFormattingOnPaste?: boolean;
};

export const SIMPLE_RICH_TEXT_CONTENT_CLASS =
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_p]:my-0 [&_p]:text-black [&_li]:text-black [&_h1]:text-black [&_h2]:text-black [&_h3]:text-black [&_a]:text-black";

const ALLOWED_TAGS = new Set([
  "P",
  "DIV",
  "BR",
  "H1",
  "H2",
  "H3",
  "STRONG",
  "B",
  "EM",
  "I",
  "U",
  "UL",
  "OL",
  "LI",
  "A",
]);

function isSafeHref(href: string): boolean {
  const normalized = href.trim().toLowerCase();
  return (
    normalized.startsWith("http://") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("mailto:") ||
    normalized.startsWith("tel:") ||
    normalized.startsWith("#")
  );
}

const ALLOWED_TEXT_ALIGN_VALUES = new Set(["left", "center", "right", "justify", "start", "end"]);
const MAX_SAFE_INDENT_PX = 320;

function extractSafeStyles(style: string): { textAlign: string | null; paddingInlineStartPx: number | null } {
  let textAlign: string | null = null;
  let paddingInlineStartPx: number | null = null;
  if (!style) return { textAlign, paddingInlineStartPx };

  const declarations = style.split(";");
  for (const declaration of declarations) {
    const [rawName, rawValue] = declaration.split(":");
    if (!rawName || !rawValue) continue;
    const name = rawName.trim().toLowerCase();
    const value = rawValue.trim().toLowerCase();

    if (name === "text-align" && ALLOWED_TEXT_ALIGN_VALUES.has(value)) {
      textAlign = value;
      continue;
    }

    if (name === "padding-inline-start" || name === "padding-left") {
      const match = value.match(/^(\d{1,3})(?:\.0+)?px$/);
      if (!match) continue;
      const parsed = Number.parseInt(match[1], 10);
      if (!Number.isFinite(parsed)) continue;
      if (parsed < 0 || parsed > MAX_SAFE_INDENT_PX) continue;
      paddingInlineStartPx = parsed;
    }
  }

  return { textAlign, paddingInlineStartPx };
}

export function richTextToPlainText(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeSimpleRichTextHtml(input: string): string {
  if (!input || typeof window === "undefined") return input || "";

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${input}</div>`, "text/html");
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return "";

  const sanitizeNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) return;
    if (node.nodeType !== Node.ELEMENT_NODE) {
      node.parentNode?.removeChild(node);
      return;
    }

    const element = node as HTMLElement;
    const tag = element.tagName.toUpperCase();

    Array.from(element.childNodes).forEach(sanitizeNode);

    if (!ALLOWED_TAGS.has(tag)) {
      const parent = element.parentNode;
      if (!parent) return;
      while (element.firstChild) {
        parent.insertBefore(element.firstChild, element);
      }
      parent.removeChild(element);
      return;
    }

    const rawHref = element.getAttribute("href") || "";
    const rawDir = element.getAttribute("dir") || "";
    const rawStyle = element.getAttribute("style") || "";
    const { textAlign: safeTextAlign, paddingInlineStartPx } = extractSafeStyles(rawStyle);
    const safeDir = rawDir === "ltr" || rawDir === "rtl" ? rawDir : null;

    Array.from(element.attributes).forEach((attribute) => {
      element.removeAttribute(attribute.name);
    });

    const safeStyleRules: string[] = [];
    if (safeTextAlign) {
      safeStyleRules.push(`text-align: ${safeTextAlign}`);
    }
    if (paddingInlineStartPx !== null) {
      safeStyleRules.push(`padding-inline-start: ${paddingInlineStartPx}px`);
    }
    if (safeStyleRules.length > 0) {
      element.setAttribute("style", safeStyleRules.join("; "));
    }
    if (safeDir) {
      element.setAttribute("dir", safeDir);
    }

    if (tag === "A") {
      if (!isSafeHref(rawHref)) {
        element.removeAttribute("href");
      } else {
        element.setAttribute("href", rawHref);
        element.setAttribute("target", "_blank");
        element.setAttribute("rel", "noopener noreferrer");
      }
    }
  };

  Array.from(root.childNodes).forEach(sanitizeNode);
  return root.innerHTML.trim();
}

function setEditorHtml(editor: LexicalEditor, html: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<html><body>${html}</body></html>`, "text/html");
  editor.update(() => {
    const nodes = $generateNodesFromDOM(editor, doc);
    const root = $getRoot();
    root.clear();
    if (nodes.length > 0) {
      root.append(...nodes);
    } else {
      root.append($createParagraphNode());
    }
  });
}

function getSanitizedEditorHtml(editor: LexicalEditor): string {
  return sanitizeSimpleRichTextHtml(
    editor.getEditorState().read(() => $generateHtmlFromNodes(editor, null))
  );
}

function ToolbarPlugin({ disabled }: { disabled: boolean }) {
  const [editor] = useLexicalComposerContext();
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    unorderedList: false,
    orderedList: false,
    link: false,
  });
  const [blockType, setBlockType] = useState<"paragraph" | "h1" | "h2">("paragraph");
  const [alignment, setAlignment] = useState<"left" | "center" | "right">("left");
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateToolbarState = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        setActiveFormats({
          bold: false,
          italic: false,
          underline: false,
          unorderedList: false,
          orderedList: false,
          link: false,
        });
        setBlockType("paragraph");
        setAlignment("left");
        return;
      }

      const anchorNode = selection.anchor.getNode();
      if ($isRootOrShadowRoot(anchorNode)) return;
      const topLevel = anchorNode.getTopLevelElementOrThrow();
      let current: LexicalNode | null = anchorNode;
      let listType: "bullet" | "number" | null = null;
      let hasLink = false;
      while (current) {
        if (!listType && $isListNode(current)) {
          const detected = current.getListType();
          listType = detected === "bullet" || detected === "number" ? detected : null;
        }
        if ($isLinkNode(current)) {
          hasLink = true;
        }
        current = current.getParent();
      }

      const formatType = topLevel.getFormatType?.() || "";
      if (formatType === "center" || formatType === "right") {
        setAlignment(formatType);
      } else {
        setAlignment("left");
      }

      if ($isHeadingNode(topLevel)) {
        const tag = topLevel.getTag();
        if (tag === "h1" || tag === "h2") {
          setBlockType(tag);
        } else {
          setBlockType("paragraph");
        }
      } else {
        setBlockType("paragraph");
      }

      setActiveFormats({
        bold: selection.hasFormat("bold"),
        italic: selection.hasFormat("italic"),
        underline: selection.hasFormat("underline"),
        unorderedList: listType === "bullet",
        orderedList: listType === "number",
        link: hasLink,
      });
    });
  }, [editor]);

  const buttonClass = (active: boolean) =>
    active
      ? "!bg-muted !text-foreground ring-1 ring-border"
      : "text-muted-foreground hover:text-foreground";

  const onToolbarMouseDown = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  const runWithFocus = useCallback(
    (action: () => void) => {
      if (disabled) return;
      editor.focus(() => {
        action();
        updateToolbarState();
      });
    },
    [disabled, editor, updateToolbarState]
  );

  const toggleList = (type: "ordered" | "unordered") => {
    runWithFocus(() => {
      if ((type === "ordered" && activeFormats.orderedList) || (type === "unordered" && activeFormats.unorderedList)) {
        editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
        return;
      }
      editor.dispatchCommand(
        type === "ordered" ? INSERT_ORDERED_LIST_COMMAND : INSERT_UNORDERED_LIST_COMMAND,
        undefined
      );
    });
  };

  const applyBlockType = (nextType: "paragraph" | "h1" | "h2") => {
    runWithFocus(() => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        if (nextType === "paragraph") {
          $setBlocksType(selection, () => $createParagraphNode());
          return;
        }
        $setBlocksType(selection, () => $createHeadingNode(nextType));
      });
    });
  };

  const applyAlignment = (nextAlignment: "left" | "center" | "right") => {
    runWithFocus(() => {
      editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, nextAlignment);
    });
  };

  const toggleLink = () => {
    if (disabled) return;
    if (activeFormats.link) {
      runWithFocus(() => {
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
      });
      return;
    }
    const url = window.prompt("Enter link URL");
    if (!url) return;
    const trimmed = url.trim();
    if (!trimmed) return;
    const normalized =
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://") ||
      trimmed.startsWith("mailto:") ||
      trimmed.startsWith("tel:")
        ? trimmed
        : `https://${trimmed}`;
    if (!isSafeHref(normalized)) return;
    runWithFocus(() => {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, normalized);
    });
  };

  const clearFormatting = () => {
    runWithFocus(() => {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
      editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "left");
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        const nodes = selection.getNodes();
        nodes.forEach((node) => {
          if ($isTextNode(node)) {
            node.setFormat(0);
            node.setStyle("");
            return;
          }
          if ($isElementNode(node) && !node.isInline() && node.getType() !== "root") {
            node.setIndent(0);
            node.setFormat("");
          }
        });

        $setBlocksType(selection, () => $createParagraphNode());
      });
    });
  };

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        updateToolbarState();
        return false;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor, updateToolbarState]);

  useEffect(() => {
    return editor.registerUpdateListener(() => {
      updateToolbarState();
    });
  }, [editor, updateToolbarState]);

  useEffect(() => {
    return editor.registerCommand(
      CAN_UNDO_COMMAND,
      (payload) => {
        setCanUndo(payload);
        return false;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor]);

  useEffect(() => {
    return editor.registerCommand(
      CAN_REDO_COMMAND,
      (payload) => {
        setCanRedo(payload);
        return false;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor]);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 p-2">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled || !canUndo}
        onMouseDown={onToolbarMouseDown}
        onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Undo"
      >
        <RotateCcw className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled || !canRedo}
        onMouseDown={onToolbarMouseDown}
        onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Redo"
      >
        <Redo2 className="h-4 w-4" />
      </Button>
      <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
      <label className="sr-only" htmlFor="simple-rich-text-block-type">
        Block type
      </label>
      <select
        id="simple-rich-text-block-type"
        value={blockType}
        disabled={disabled}
        onChange={(event) => applyBlockType(event.target.value as "paragraph" | "h1" | "h2")}
        className="h-8 min-w-[140px] rounded-md border border-border bg-background px-2 text-sm text-black"
      >
        <option value="paragraph">Paragraph</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
      </select>
      <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled}
        onMouseDown={onToolbarMouseDown}
        onClick={() => runWithFocus(() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold"))}
        aria-pressed={activeFormats.bold}
        className={buttonClass(activeFormats.bold)}
        aria-label="Bold"
      >
        <Bold className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled}
        onMouseDown={onToolbarMouseDown}
        onClick={() => runWithFocus(() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic"))}
        aria-pressed={activeFormats.italic}
        className={buttonClass(activeFormats.italic)}
        aria-label="Italic"
      >
        <Italic className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled}
        onMouseDown={onToolbarMouseDown}
        onClick={() => runWithFocus(() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline"))}
        aria-pressed={activeFormats.underline}
        className={buttonClass(activeFormats.underline)}
        aria-label="Underline"
      >
        <Underline className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled}
        onMouseDown={onToolbarMouseDown}
        onClick={toggleLink}
        aria-pressed={activeFormats.link}
        className={buttonClass(activeFormats.link)}
        aria-label="Link"
      >
        <Link2 className="h-4 w-4" />
      </Button>
      <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled}
        onMouseDown={onToolbarMouseDown}
        onClick={() => toggleList("unordered")}
        aria-pressed={activeFormats.unorderedList}
        className={buttonClass(activeFormats.unorderedList)}
      >
        <List className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled}
        onMouseDown={onToolbarMouseDown}
        onClick={() => toggleList("ordered")}
        aria-pressed={activeFormats.orderedList}
        className={buttonClass(activeFormats.orderedList)}
      >
        <ListOrdered className="h-4 w-4" />
      </Button>
      <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled}
        onMouseDown={onToolbarMouseDown}
        onClick={() => applyAlignment("left")}
        className={buttonClass(alignment === "left")}
        aria-label="Align left"
      >
        <AlignLeft className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled}
        onMouseDown={onToolbarMouseDown}
        onClick={() => applyAlignment("center")}
        className={buttonClass(alignment === "center")}
        aria-label="Align center"
      >
        <AlignCenter className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled}
        onMouseDown={onToolbarMouseDown}
        onClick={() => applyAlignment("right")}
        className={buttonClass(alignment === "right")}
        aria-label="Align right"
      >
        <AlignRight className="h-4 w-4" />
      </Button>
      <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled}
        onMouseDown={onToolbarMouseDown}
        onClick={() => runWithFocus(() => editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined))}
        aria-label="Outdent"
        className="text-muted-foreground hover:text-foreground"
      >
        <IndentDecrease className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled}
        onMouseDown={onToolbarMouseDown}
        onClick={() => runWithFocus(() => editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined))}
        aria-label="Indent"
        className="text-muted-foreground hover:text-foreground"
      >
        <IndentIncrease className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled}
        onMouseDown={onToolbarMouseDown}
        onClick={clearFormatting}
        aria-label="Clear formatting"
        className="text-muted-foreground hover:text-foreground"
      >
        <RemoveFormatting className="h-4 w-4" />
      </Button>
    </div>
  );
}

function SyncHtmlValuePlugin({
  value,
  lastExternalValueRef,
}: {
  value: string;
  lastExternalValueRef: MutableRefObject<string>;
}) {
  const [editor] = useLexicalComposerContext();
  const didInitializeRef = useRef(false);

  useEffect(() => {
    const sanitizedValue = sanitizeSimpleRichTextHtml(value || "");
    const currentEditorHtml = getSanitizedEditorHtml(editor);

    if (!didInitializeRef.current) {
      didInitializeRef.current = true;
      lastExternalValueRef.current = sanitizedValue;
      if (currentEditorHtml !== sanitizedValue) {
        setEditorHtml(editor, sanitizedValue);
      }
      return;
    }

    if (sanitizedValue === lastExternalValueRef.current) return;
    lastExternalValueRef.current = sanitizedValue;
    if (currentEditorHtml === sanitizedValue) return;
    setEditorHtml(editor, sanitizedValue);
  }, [editor, value, lastExternalValueRef]);

  return null;
}

function PlainTextPastePlugin({
  enabled,
}: {
  enabled: boolean;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!enabled) return;

    return editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent | null) => {
        const plainText = event?.clipboardData?.getData("text/plain");
        if (!plainText) return false;
        event?.preventDefault();
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            selection.insertText(plainText);
          }
        });
        return true;
      },
      COMMAND_PRIORITY_HIGH
    );
  }, [editor, enabled]);

  return null;
}

export function SimpleRichTextEditor({
  value,
  onChange,
  placeholder = "Write here...",
  disabled = false,
  className,
  minHeightClassName = "min-h-[180px]",
  stripFormattingOnPaste = false,
}: SimpleRichTextEditorProps) {
  const lastExternalValueRef = useRef(sanitizeSimpleRichTextHtml(value || ""));

  const initialConfig = useMemo(
    () => ({
      namespace: "tradetool-simple-rich-text",
      onError: (error: Error) => {
        throw error;
      },
      editable: !disabled,
      nodes: [ListNode, ListItemNode, LinkNode, AutoLinkNode, HeadingNode],
      editorState: () => {},
    }),
    [disabled]
  );

  return (
    <div className={cn("rounded-md border border-border bg-background", className)}>
      <LexicalComposer initialConfig={initialConfig}>
        <ToolbarPlugin disabled={disabled} />
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className={cn(
                "w-full px-3 py-2 text-sm text-black outline-none",
                SIMPLE_RICH_TEXT_CONTENT_CLASS,
                minHeightClassName,
                disabled ? "cursor-not-allowed bg-muted/20 text-muted-foreground" : ""
              )}
              aria-label="Rich text editor"
            />
          }
          placeholder={
            <p className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground">
              {placeholder}
            </p>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <ListPlugin />
        <LinkPlugin />
        <PlainTextPastePlugin enabled={stripFormattingOnPaste} />
        <OnChangePlugin
          onChange={(editorState, editor) => {
            editorState.read(() => {
              const html = sanitizeSimpleRichTextHtml($generateHtmlFromNodes(editor, null));
              if (html === lastExternalValueRef.current) return;
              lastExternalValueRef.current = html;
              onChange(html);
            });
          }}
        />
        <SyncHtmlValuePlugin value={value} lastExternalValueRef={lastExternalValueRef} />
      </LexicalComposer>
    </div>
  );
}
