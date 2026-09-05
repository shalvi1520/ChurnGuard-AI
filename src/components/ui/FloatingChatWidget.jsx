import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Send, Sparkles, User, Minus } from 'lucide-react';
import { chatService } from '../../services/api';
import { formatRelativeDate } from '../../utils/helpers';
import Button from './Button';

export default function FloatingChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hi! I can help you analyze churn risk or navigate the app. How can I help?',
      timestamp: new Date().toISOString(),
    }
  ]);
  
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isMinimized, isTyping]);

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!input.trim()) return;

    const userMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    try {
      const response = await chatService.sendMessage(input.trim());
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.message,
        timestamp: new Date().toISOString(),
      }]);
    } catch (error) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date().toISOString(),
      }]);
    }
    setIsTyping(false);
  };

  const toggleOpen = () => {
    if (isOpen && isMinimized) {
      setIsMinimized(false);
    } else if (isOpen && !isMinimized) {
      setIsOpen(false);
    } else {
      setIsOpen(true);
      setIsMinimized(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ 
              opacity: 1, 
              y: isMinimized ? 'calc(100% - 56px)' : 0, 
              scale: 1 
            }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-20 right-6 z-50 w-80 sm:w-96 bg-bg-secondary border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            style={{ height: '500px', maxHeight: 'calc(100vh - 120px)' }}
          >
            {/* Header */}
            <div className="h-14 px-4 border-b border-border bg-bg-tertiary/50 flex items-center justify-between shrink-0 cursor-pointer" onClick={() => setIsMinimized(!isMinimized)}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg gradient-accent flex items-center justify-center">
                  <Sparkles size={14} className="text-bg-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">ChurnGuard AI</h3>
                  <p className="text-[10px] text-text-tertiary">Ask me anything</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}
                  className="p-1.5 text-text-tertiary hover:text-text-primary rounded-lg hover:bg-bg-tertiary transition-colors cursor-pointer"
                >
                  <Minus size={16} />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
                  className="p-1.5 text-text-tertiary hover:text-text-primary rounded-lg hover:bg-bg-tertiary transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-bg-primary">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-1 ${msg.role === 'assistant' ? 'bg-accent/10' : 'bg-bg-tertiary'}`}>
                    {msg.role === 'assistant' ? <Sparkles size={10} className="text-accent" /> : <User size={10} className="text-text-tertiary" />}
                  </div>
                  <div className={`max-w-[75%] ${msg.role === 'user' ? 'text-right' : ''}`}>
                    <div className={`rounded-xl p-3 text-[13px] leading-relaxed ${msg.role === 'user' ? 'bg-accent/10 text-text-primary border border-accent/20 rounded-tr-sm' : 'bg-bg-secondary text-text-secondary border border-border rounded-tl-sm'}`}>
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </div>
                    <p className="text-[9px] text-text-tertiary mt-1">{formatRelativeDate(msg.timestamp)}</p>
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-md bg-accent/10 flex items-center justify-center shrink-0 mt-1">
                    <Sparkles size={10} className="text-accent" />
                  </div>
                  <div className="bg-bg-secondary border border-border rounded-xl rounded-tl-sm p-3">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 border-t border-border bg-bg-secondary shrink-0">
              <form onSubmit={handleSend} className="relative">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask a question..."
                  className="w-full pl-3 pr-10 py-2 bg-bg-tertiary/50 border border-border rounded-lg text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent transition-colors"
                  disabled={isTyping}
                />
                <button 
                  type="submit" 
                  disabled={!input.trim() || isTyping}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-accent hover:text-accent-dim disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  <Send size={14} />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={toggleOpen}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full gradient-accent shadow-lg shadow-accent/20 flex items-center justify-center text-bg-primary cursor-pointer hover:shadow-xl hover:shadow-accent/30 transition-shadow"
      >
        {isOpen && !isMinimized ? <X size={20} /> : <MessageSquare size={20} />}
      </motion.button>
    </>
  );
}
