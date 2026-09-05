import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles, User, ArrowRight, RotateCcw } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { chatService } from '../services/api';
import { formatRelativeDate } from '../utils/helpers';

const suggestedPrompts = [
  'Which customers are at highest risk?',
  'What are the biggest churn drivers?',
  'Summarize today\'s retention risks',
  'How many high-risk customers do we have?',
  'Draft an outreach email',
  'Explain SHAP in simple terms',
];

export default function AIAssistantPage() {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hello! I\'m the ChurnGuard AI Assistant. I can help you understand customer retention data, analyze churn risk, and draft outreach emails.\n\nHow can I help you today?',
      timestamp: new Date().toISOString(),
      actions: [],
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (text = input) => {
    if (!text.trim()) return;

    const userMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    try {
      const response = await chatService.sendMessage(text.trim());
      const aiMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.message,
        timestamp: new Date().toISOString(),
        actions: response.actions || [],
      };
      setMessages(prev => [...prev, aiMessage]);
    } catch (e) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I apologize, but I encountered an error processing your request. Please try again.',
        timestamp: new Date().toISOString(),
        actions: [],
      }]);
    }
    setIsTyping(false);
  };

  const handleClear = () => {
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: 'Chat cleared. How can I help you?',
      timestamp: new Date().toISOString(),
      actions: [],
    }]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">AI Assistant</h1>
          <p className="text-sm text-text-tertiary mt-0.5">Ask questions about your customer retention data.</p>
        </div>
        <Button variant="ghost" size="sm" icon={RotateCcw} onClick={handleClear}>Clear Chat</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Chat */}
        <div className="lg:col-span-3">
          <Card padding={false} className="flex flex-col h-[calc(100vh-220px)]">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${msg.role === 'assistant' ? 'bg-accent/10' : 'bg-bg-tertiary'}`}>
                    {msg.role === 'assistant' ? <Sparkles size={14} className="text-accent" /> : <User size={14} className="text-text-tertiary" />}
                  </div>
                  <div className={`max-w-[70%] ${msg.role === 'user' ? 'text-right' : ''}`}>
                    <div className={`rounded-xl p-3.5 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-accent/10 text-text-primary border border-accent/20' : 'bg-bg-tertiary/50 text-text-secondary border border-border'}`}>
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </div>
                    {msg.actions?.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {msg.actions.map((action, i) => (
                          <a
                            key={i}
                            href={action.link}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-bg-tertiary text-xs font-medium text-accent hover:bg-bg-elevated transition-colors"
                          >
                            {action.label} <ArrowRight size={10} />
                          </a>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-text-tertiary mt-1">{formatRelativeDate(msg.timestamp)}</p>
                  </div>
                </motion.div>
              ))}

              {isTyping && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <Sparkles size={14} className="text-accent" />
                  </div>
                  <div className="bg-bg-tertiary/50 border border-border rounded-xl p-3.5">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 rounded-full bg-text-tertiary animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 rounded-full bg-text-tertiary animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 rounded-full bg-text-tertiary animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-border">
              <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about customer retention..."
                  className="flex-1 px-4 py-2.5 bg-bg-tertiary/50 border border-border rounded-lg text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent transition-colors"
                  disabled={isTyping}
                />
                <Button type="submit" size="md" icon={Send} disabled={!input.trim() || isTyping}>Send</Button>
              </form>
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader><p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Suggested Prompts</p></CardHeader>
            <div className="space-y-1.5">
              {suggestedPrompts.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(prompt)}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
                >
                  "{prompt}"
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
