import React, { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Send, TerminalSquare, RotateCcw, MessageSquareDashed } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

// Solved detection patterns
const SOLVED_PATTERNS = [
  /\b(found it|got it|fixed it|figured it out|i see it now|i see the problem|i see the bug|i see the issue)\b/i,
  /\b(oh i see|oh! i see|aha|eureka)\b/i,
  /\b(i understand now|now i understand|that('s| was) it|i('ve| have) got it)\b/i,
  /\b(solved|solved it|i solved|problem solved)\b/i,
  /\b(i('ve| have) fixed|i fixed it|the (bug|issue|problem) (is|was))\b/i,
  /\b(it('s| is) working|now it works|works now)\b/i
];

type SessionState = 'idle' | 'describing' | 'debugging' | 'solved';
type Message = { role: 'user' | 'assistant'; content: string };

function Home() {
  const [sessionState, setSessionState] = useState<SessionState>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [inputValue]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming, isThinking]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    if (sessionState === 'idle' && e.target.value.trim().length > 0) {
      setSessionState('describing');
    } else if (sessionState === 'describing' && e.target.value.trim().length === 0) {
      setSessionState('idle');
    }
  };

  const checkIsSolved = (text: string) => {
    return SOLVED_PATTERNS.some(pattern => pattern.test(text));
  };

  const sendMessage = async (newMessages: Message[], mode: "socratic" | "debrief") => {
    setIsThinking(true);
    setMessages([...newMessages, { role: "assistant", content: "" }]);
    setIsStreaming(true);

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, mode }),
      });

      if (!res.ok) throw new Error("Failed to send message");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");
      
      setIsThinking(false);
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const json = JSON.parse(line.slice(6));
              if (json.done) {
                setIsStreaming(false);
                return;
              }
              if (json.content) {
                setMessages(prev => {
                  const last = prev[prev.length - 1];
                  return [
                    ...prev.slice(0, -1),
                    { ...last, content: last.content + json.content }
                  ];
                });
              }
            } catch (e) {
              console.error("Parse error:", e);
            }
          }
        }
      }
    } catch (error) {
      console.error(error);
      setIsThinking(false);
      setIsStreaming(false);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = inputValue.trim();
    if (!text || isStreaming || isThinking) return;

    setInputValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    const isSolvedMatch = checkIsSolved(text);
    let nextState = sessionState;
    let mode: "socratic" | "debrief" = "socratic";

    if (sessionState === 'describing') {
      nextState = 'debugging';
    } else if (sessionState === 'debugging' && isSolvedMatch) {
      nextState = 'solved';
      mode = "debrief";
    }

    setSessionState(nextState);

    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);

    sendMessage(newMessages, mode);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleRestart = () => {
    setSessionState('idle');
    setMessages([]);
    setInputValue("");
  };

  return (
    <div className="min-h-[100dvh] w-full flex flex-col bg-background text-foreground dark">
      {/* Header */}
      <header className="flex-none p-4 md:p-6 border-b border-border/50 flex items-center justify-between z-10 bg-background/80 backdrop-blur-sm sticky top-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20 shadow-[0_0_15px_rgba(234,136,36,0.15)]">
            <TerminalSquare className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-mono font-medium tracking-tight text-foreground/90">Rubber Duck</h1>
            <p className="text-xs text-muted-foreground font-mono">Socratic Debugging Session</p>
          </div>
        </div>
        {sessionState !== 'idle' && (
          <button 
            onClick={handleRestart}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-mono text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="hidden sm:inline">New Session</span>
          </button>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center w-full max-w-4xl mx-auto p-4 md:p-6 relative">
        
        {/* Idle/Welcome State */}
        {sessionState === 'idle' && messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center max-w-2xl mx-auto animate-in fade-in zoom-in duration-500 delay-150">
            <div className="w-24 h-24 mb-8 rounded-2xl bg-primary/5 flex items-center justify-center border border-primary/20 shadow-[0_0_30px_rgba(234,136,36,0.1)] relative">
              <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
              <TerminalSquare className="w-12 h-12 text-primary relative z-10" />
            </div>
            <h2 className="text-3xl md:text-4xl font-mono font-semibold mb-4 text-foreground/90">
              Talk to the duck.
            </h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-lg leading-relaxed">
              Describe your bug. I won't give you the answer, but I'll ask the right questions until you find it yourself.
            </p>
          </div>
        )}

        {/* Messages List */}
        {(messages.length > 0 || sessionState === 'describing') && (
          <div className="flex-1 w-full space-y-6 pb-32 pt-4">
            {messages.map((msg, idx) => {
              const isLast = idx === messages.length - 1;
              const isDuck = msg.role === 'assistant';

              if (sessionState === 'solved' && isDuck && isLast) {
                // Debrief Card Styling
                return (
                  <div key={idx} className="w-full flex justify-center animate-in slide-in-from-bottom-4 fade-in duration-500">
                    <div className="w-full max-w-3xl bg-secondary/30 border border-primary/30 rounded-xl p-6 shadow-[0_0_40px_rgba(234,136,36,0.1)] relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                      <div className="flex items-center gap-3 mb-4 text-primary">
                        <TerminalSquare className="w-5 h-5" />
                        <span className="font-mono text-sm font-semibold tracking-wider uppercase">Debrief</span>
                      </div>
                      <div className="prose prose-invert prose-p:leading-relaxed prose-pre:bg-background/50 prose-pre:border prose-pre:border-border/50 prose-a:text-primary hover:prose-a:text-primary/80 max-w-none">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                        {isStreaming && isLast && <span className="inline-block w-2 h-4 bg-primary ml-1 align-middle cursor-blink" />}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div 
                  key={idx} 
                  className={`w-full flex ${isDuck ? 'justify-start' : 'justify-end'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
                >
                  <div className={`flex max-w-[85%] sm:max-w-[75%] gap-4 ${isDuck ? 'flex-row' : 'flex-row-reverse'}`}>
                    
                    {isDuck && (
                      <div className="flex-none w-8 h-8 rounded bg-primary/10 border border-primary/20 flex items-center justify-center mt-1">
                        <TerminalSquare className="w-4 h-4 text-primary" />
                      </div>
                    )}
                    
                    <div className={`
                      px-5 py-4 rounded-2xl text-[0.95rem] leading-relaxed relative
                      ${isDuck 
                        ? 'bg-secondary/40 border border-border/50 rounded-tl-sm text-foreground/90' 
                        : 'bg-primary/10 border border-primary/20 text-primary-foreground rounded-tr-sm text-foreground shadow-[0_0_15px_rgba(234,136,36,0.05)]'
                      }
                    `}>
                      <div className="prose prose-invert prose-sm max-w-none prose-p:m-0 prose-p:mb-2 last:prose-p:mb-0 prose-pre:bg-background/80 prose-pre:border prose-pre:border-border/50">
                        {isDuck ? (
                          <>
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                            {isStreaming && isLast && <span className="inline-block w-2 h-4 bg-primary ml-1 align-middle cursor-blink" />}
                          </>
                        ) : (
                          <div className="whitespace-pre-wrap font-mono text-sm">{msg.content}</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            
            {isThinking && (
              <div className="flex justify-start animate-in fade-in">
                <div className="flex max-w-[85%] gap-4">
                  <div className="flex-none w-8 h-8 rounded bg-primary/10 border border-primary/20 flex items-center justify-center mt-1">
                    <TerminalSquare className="w-4 h-4 text-primary" />
                  </div>
                  <div className="px-5 py-4 rounded-2xl bg-secondary/40 border border-border/50 rounded-tl-sm flex items-center gap-1.5 h-12">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" />
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        )}

      </main>

      {/* Input Area */}
      <div className={`
        fixed bottom-0 left-0 right-0 p-4 md:p-6 bg-gradient-to-t from-background via-background/95 to-transparent pt-12 transition-all duration-500 ease-in-out
        ${sessionState === 'idle' ? 'translate-y-0 relative !bg-transparent !pt-0' : 'translate-y-0'}
        ${sessionState === 'solved' ? 'opacity-0 pointer-events-none translate-y-8' : 'opacity-100'}
      `}>
        <div className="max-w-3xl mx-auto relative">
          <form 
            onSubmit={handleSubmit}
            className={`
              relative bg-secondary/40 border border-border/60 rounded-xl shadow-lg backdrop-blur-xl focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all duration-300
              ${sessionState === 'idle' ? 'shadow-[0_0_40px_rgba(234,136,36,0.08)] bg-secondary/20' : ''}
            `}
          >
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={sessionState === 'idle' ? "Describe your bug..." : "Answer the duck..."}
              className="w-full bg-transparent border-0 resize-none px-4 py-4 pr-14 text-foreground focus:ring-0 placeholder:text-muted-foreground/60 min-h-[60px] max-h-[200px] font-mono text-sm leading-relaxed"
              rows={1}
              disabled={isStreaming || isThinking || sessionState === 'solved'}
            />
            
            <button
              type="submit"
              disabled={!inputValue.trim() || isStreaming || isThinking || sessionState === 'solved'}
              className="absolute right-2 bottom-2 p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 disabled:hover:bg-primary transition-all duration-200 shadow-sm"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <div className="text-center mt-3">
            <span className="text-[10px] text-muted-foreground/50 font-mono uppercase tracking-widest">
              Shift + Enter for newline
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
