"use client";

import {
  FileText,
  Image as ImageIcon,
  Mic,
  MoreHorizontal,
  Paperclip,
  Send,
  Smile,
} from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface MessageInputProps {
  onSendMessage: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function MessageInput({
  onSendMessage,
  disabled = false,
  placeholder = "Type a message...",
}: MessageInputProps) {
  const [message, setMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSendMessage = () => {
    const trimmedMessage = message.trim();
    if (trimmedMessage && !disabled) {
      onSendMessage(trimmedMessage);
      setMessage("");
      setIsTyping(false);

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessage(value);

    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }

    // Handle typing indicator
    if (value.trim() && !isTyping) {
      setIsTyping(true);
    } else if (!value.trim() && isTyping) {
      setIsTyping(false);
    }
  };

  const handleFileUpload = (type: "image" | "file") => {
    // In a real app, this would open a file picker
    console.log(`Upload ${type}`);
  };

  return (
    <div className="border-t p-4">
      <div className="flex items-end gap-2">
        {/* Attachment button */}
        <TooltipProvider>
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    className="cursor-pointer disabled:cursor-not-allowed"
                    disabled={disabled}
                    size="icon"
                    variant="ghost"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>Attach file</p>
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start" side="top">
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => handleFileUpload("image")}
              >
                <ImageIcon className="mr-2 h-4 w-4" />
                Photo or video
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => handleFileUpload("file")}
              >
                <FileText className="mr-2 h-4 w-4" />
                Document
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TooltipProvider>

        {/* Message input */}
        <div className="relative flex-1">
          <Textarea
            className={cn(
              "max-h-[120px] min-h-[40px] cursor-text resize-none disabled:cursor-not-allowed",
              "pr-20" // Space for emoji and more buttons
            )}
            disabled={disabled}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyPress}
            placeholder={placeholder}
            ref={textareaRef}
            rows={1}
            value={message}
          />

          {/* Input action buttons */}
          <div className="absolute right-2 bottom-2 flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="h-6 w-6 cursor-pointer p-0 disabled:cursor-not-allowed"
                    disabled={disabled}
                    size="sm"
                    variant="ghost"
                  >
                    <Smile className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Add emoji</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="h-6 w-6 cursor-pointer p-0 disabled:cursor-not-allowed"
                    disabled={disabled}
                    size="sm"
                    variant="ghost"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>More options</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Voice message or send button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {message.trim() ? (
                <Button
                  className="cursor-pointer disabled:cursor-not-allowed"
                  disabled={disabled}
                  onClick={handleSendMessage}
                >
                  <Send className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  className="cursor-pointer disabled:cursor-not-allowed"
                  disabled={disabled}
                  size="icon"
                  variant="ghost"
                >
                  <Mic className="h-4 w-4" />
                </Button>
              )}
            </TooltipTrigger>
            <TooltipContent>
              <p>{message.trim() ? "Send message" : "Voice message"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Typing indicator */}
      {isTyping && (
        <div className="mt-2 text-muted-foreground text-xs">
          You are typing...
        </div>
      )}
    </div>
  );
}
