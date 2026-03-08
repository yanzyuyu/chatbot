import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Bot, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { ChatMessage } from '../services/geminiService';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  isLoading: boolean;
}

export function ChatInterface({ messages, onSendMessage, isLoading }: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);

  const handleScroll = () => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      setIsNearBottom(scrollHeight - scrollTop - clientHeight < 150);
    }
  };

  useEffect(() => {
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages, isLoading, isNearBottom]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput('');
      setIsNearBottom(true); // Force scroll to bottom on new message
    }
  };

  const processMessageText = (text: string) => {
    let processed = text;
    // Replace <execute> tags with markdown code blocks
    processed = processed.replace(/<execute>([\s\S]*?)<\/execute>/g, (match, p1) => {
      return `\n\`\`\`bash\n> ${p1.trim()}\n\`\`\`\n`;
    });
    // Replace <write_file> tags with markdown code blocks
    processed = processed.replace(/<write_file\s+path="([^"]+)">([\s\S]*?)<\/write_file>/g, (match, p1, p2) => {
      return `\n\`\`\`${p1.split('.').pop() || 'text'}\n// File: ${p1}\n${p2.trim()}\n\`\`\`\n`;
    });
    return processed;
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] rounded-2xl shadow-xl border border-stone-800 overflow-hidden">
      <div 
        ref={chatContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar scroll-smooth"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-stone-400 space-y-4">
            <Bot className="w-12 h-12 opacity-50" />
            <p className="text-center max-w-xs">
              Halo! Saya AI Jago Coding. Apa yang ingin kamu buat hari ini?
            </p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`flex items-start gap-4 ${
                msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-[#252526] text-stone-300 border border-stone-700'
                }`}
              >
                {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
              </div>
              <div
                className={`flex flex-col max-w-[85%] ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`px-4 py-3 rounded-2xl ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-none'
                      : 'bg-[#252526] text-stone-300 border border-stone-800 rounded-tl-none'
                  }`}
                >
                  {msg.role === 'model' ? (
                    <div className="prose prose-sm prose-invert max-w-none">
                      <ReactMarkdown>{processMessageText(msg.text)}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-[#252526] text-stone-300 border border-stone-700 flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div className="px-4 py-3 rounded-2xl bg-[#252526] text-stone-300 border border-stone-800 rounded-tl-none flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-stone-500" />
              <span className="text-sm text-stone-500">Berpikir...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-[#252526] border-t border-stone-800">
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 bg-[#1e1e1e] border border-stone-700 rounded-full px-4 py-2 focus-within:ring-1 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ketik instruksi coding di sini..."
            className="flex-1 bg-transparent border-none focus:outline-none text-stone-200 placeholder:text-stone-500 py-2"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
