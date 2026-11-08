"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UIMessage } from "ai";
import { ArrowDownIcon, DownloadIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useRef } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";

export type ConversationProps = ComponentProps<typeof StickToBottom>;

// Scroll feel: a thread opens already at the bottom (no long animated scroll
// through history), then follows streamed content with a heavily damped spring
// so growth glides instead of snapping or bouncing.
export const Conversation = ({ className, ...props }: ConversationProps) => (
  <StickToBottom
    className={cn("relative flex-1 overflow-y-hidden", className)}
    damping={0.8}
    initial="instant"
    mass={1}
    resize="smooth"
    role="log"
    stiffness={0.07}
    {...props}
  />
);

/**
 * Re-engages stick-to-bottom whenever the user sends a new message, so the
 * transcript glides down to the new turn even if they had scrolled up.
 */
export const ConversationScrollOnSend = ({ messages }: { messages: UIMessage[] }) => {
  const { scrollToBottom } = useStickToBottomContext();
  const seen = useRef<{ ready: boolean; lastUserId: string | null }>({
    ready: false,
    lastUserId: null,
  });

  useEffect(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const id = lastUser?.id ?? null;
    if (!seen.current.ready) {
      // Opening an existing thread: don't treat history as a new send.
      seen.current = { ready: true, lastUserId: id };
      return;
    }
    if (id && id !== seen.current.lastUserId) {
      seen.current.lastUserId = id;
      void scrollToBottom();
    }
  }, [messages, scrollToBottom]);

  return null;
};

export type ConversationContentProps = ComponentProps<typeof StickToBottom.Content>;

export const ConversationContent = ({ className, scrollClassName, ...props }: ConversationContentProps) => (
  <StickToBottom.Content
    className={cn("flex flex-col gap-6 p-4", className)}
    scrollClassName={cn("chat-scroll", scrollClassName)}
    {...props}
  />
);

export type ConversationEmptyStateProps = ComponentProps<"div"> & {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
};

export const ConversationEmptyState = ({
  className,
  title = "No messages yet",
  description = "Start a conversation to see messages here",
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) => (
  <div
    className={cn(
      "flex size-full flex-col items-center justify-center gap-3 p-8 text-center",
      className,
    )}
    {...props}
  >
    {children ?? (
      <>
        {icon && <div className="text-muted-foreground">{icon}</div>}
        <div className="space-y-1">
          <h3 className="font-medium text-sm">{title}</h3>
          {description && <p className="text-muted-foreground text-sm">{description}</p>}
        </div>
      </>
    )}
  </div>
);

export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

export const ConversationScrollButton = ({
  className,
  ...props
}: ConversationScrollButtonProps) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  return (
    !isAtBottom && (
      <Button
        aria-label="Scroll to latest message"
        className={cn(
          "absolute bottom-4 left-[50%] size-9 translate-x-[-50%] rounded-full border-[var(--hairline-strong)] bg-surface shadow-[var(--shadow-card)] transition-[transform,box-shadow] duration-150 hover:bg-surface hover:shadow-[var(--shadow-hover)] active:scale-95",
          "animate-in fade-in zoom-in-90 duration-200",
          className,
        )}
        onClick={handleScrollToBottom}
        size="icon"
        type="button"
        variant="outline"
        {...props}
      >
        <ArrowDownIcon className="size-4" />
      </Button>
    )
  );
};

const getMessageText = (message: UIMessage): string =>
  message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");

export type ConversationDownloadProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  messages: UIMessage[];
  filename?: string;
  formatMessage?: (message: UIMessage, index: number) => string;
};

const defaultFormatMessage = (message: UIMessage): string => {
  const roleLabel = message.role.charAt(0).toUpperCase() + message.role.slice(1);
  return `**${roleLabel}:** ${getMessageText(message)}`;
};

export const messagesToMarkdown = (
  messages: UIMessage[],
  formatMessage: (message: UIMessage, index: number) => string = defaultFormatMessage,
): string => messages.map((msg, i) => formatMessage(msg, i)).join("\n\n");

export const ConversationDownload = ({
  messages,
  filename = "conversation.md",
  formatMessage = defaultFormatMessage,
  className,
  children,
  ...props
}: ConversationDownloadProps) => {
  const handleDownload = useCallback(() => {
    const markdown = messagesToMarkdown(messages, formatMessage);
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [messages, filename, formatMessage]);

  return (
    <Button
      className={cn(
        "absolute top-4 right-4 rounded-full dark:bg-background dark:hover:bg-muted",
        className,
      )}
      onClick={handleDownload}
      size="icon"
      type="button"
      variant="outline"
      {...props}
    >
      {children ?? <DownloadIcon className="size-4" />}
    </Button>
  );
};
