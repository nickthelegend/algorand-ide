import React, { useState, useRef, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { createClient } from '@supabase/supabase-js';
import { getEmbedding, cosineSimilarity } from "@/lib/embed";

interface AIChatProps {
  title: string;
  selectedTemplate?: string;
  activeFile?: string;
  fileContent?: string;
  onFileUpdate?: (filePath: string, content: string) => void;
  onClose?: () => void;
}

interface Message {
  type: 'user' | 'ai';
  text: string;
  isLoading?: boolean;
}

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://toqvsuthxooqjelcayhm.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'your-supabase-anon-key';

// Validate environment variables
if (supabaseUrl === "https://toqvsuthxooqjelcayhm.supabase.co") {
}

const supabase = createClient(supabaseUrl, supabaseKey);

const AIChat: React.FC<AIChatProps> = ({ title, selectedTemplate = "Pyteal", activeFile, fileContent, onFileUpdate, onClose }) => {
  const [selectedModel, setSelectedModel] = useState<string>('gpt-4o-mini');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Get table name based on selected template
  const getTableName = (template: string) => {
    switch (template) {
      case "PuyaPy":
        return "algopy";
      case "TealScript":
        return "tealscript";
      case "PuyaTs":
        return "puyats";
      case "Pyteal":
      default:
        return "pyteal";
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Test Supabase connection and show table info on mount
  useEffect(() => {
    const testConnection = async () => {
      const tableName = getTableName(selectedTemplate);
      
      try {
        // Test connection by fetching table info
        const { data, error } = await supabase
          .from(tableName)
          .select('count')
          .limit(1);
        
        if (error) {
        } else {
          
          // Get actual table count
          const { count, error: countError } = await supabase
            .from(tableName)
            .select('*', { count: 'exact', head: true });
          
          if (countError) {
          } else {
          }
        }
      } catch (error) {
      }
    };

    testConnection();
    
    // Add a test message to verify markdown rendering
  }, [selectedTemplate]);

  // Get framework-specific context without embeddings
  const getFrameworkContext = (template: string) => {
    const contexts: Record<string, string> = {
      "PuyaTs": `You generate PuyaTS smart contracts using @algorandfoundation/algorand-typescript.

Follow these rules with zero exceptions:
1. ABI methods may ONLY use these parameter and return types:
   - string
   - uint64
   - byte[]
2. Never allow number anywhere in a method signature. If the user requests a method with number, automatically convert it to uint64.
3. Never allow JavaScript types in ABI methods:
   - no number
   - no bigint
   - no boolean
   - no objects { }
   - no arrays [] (except byte[])
   - no interfaces
   - no union types
   - no optional parameters
   - no generics
4. If the user provides an object or struct-like argument: Flatten it into multiple ABI parameters using only: string, uint64, byte[]
5. Never call or reference JavaScript constructors or helpers:
   - no Number()
   - no String()
   - no Boolean()
   - no parseInt()
   - no JSON operations
   - no math helpers
6. All arithmetic must occur directly on uint64 values.
7. Internal methods are allowed to use number, but ABI-exposed ones never.
8. Output format must always be:

import { Contract, uint64 } from '@algorandfoundation/algorand-typescript'

export class ContractName extends Contract {
  // methods only using string, uint64, byte[]
}

9. Output code only, no explanations, no comments, no surrounding text.
10. Any violation of the rules must be auto-corrected silently by rewriting the method properly.

Example: If user asks for public hello(name: string, age: number): string
You output: public hello(name: string, age: uint64): string`,
      
      "TealScript": `TealScript is a TypeScript-based language for Algorand smart contracts. Key features:
- Contracts extend Contract class
- Use decorators for ABI methods
- State variables with GlobalStateKey and LocalStateKey
- Built-in Algorand types and operations
- Compile to TEAL and generate ARC56 artifacts
- Test with Jest framework`,
      
      "PuyaPy": `PuyaPy (AlgoPy) is a Pythonic framework for Algorand smart contracts. Key features:
- Import from algopy module
- Contracts extend ARC4Contract or Contract
- Use @abimethod decorator for ABI methods
- Type hints with UInt64, Bytes, Account, etc.
- Global and local state with typed storage
- Compile with 'puyapy' command to generate TEAL`,
      
      "Pyteal": `PyTeal is a Python library for writing Algorand smart contracts. Key features:
- Import from pyteal module
- Use Expr types for all operations
- Approval and clear programs
- Scratch variables and global/local state
- Compile to TEAL using compileTeal()
- Note: PyTeal is deprecated, consider using PuyaPy instead`
    };
    
    return contexts[template] || contexts["PuyaTs"];
  };

  // Extract code from AI response using regex
  const extractCodeFromResponse = (response: string): string | null => {
    const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)\n```/;
    const match = response.match(codeBlockRegex);
    return match ? match[1].trim() : null;
  };

  // OpenAI API call
  const askOpenAI = async (prompt: string, isCodeEdit: boolean = false) => {
    try {
      
      const systemPrompt = isCodeEdit 
        ? `You are a coding assistant integrated into an IDE. The user will provide the current code file. Your task is to return the full modified code with the requested changes applied. Do not explain, just return the updated code wrapped in a single code block. Preserve formatting, comments, and structure. Do not remove unrelated code.`
        : `You are a helpful Algorand development assistant specializing in ${selectedTemplate}. You have deep knowledge of Algorand smart contract development. Always format your responses using markdown for better readability. Use code blocks with appropriate language tags for code examples. Provide practical, working examples when possible.`;
      
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API Error: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(`API Error: ${data.error.message || 'Unknown error'}`);
      }
      
      
      return data.choices[0].message.content;
    } catch (error: any) {
      
      if (error.message?.includes('rate-limited') || error.message?.includes('429')) {
        return "The AI service is currently rate-limited. Please try switching to a different model or wait a moment before trying again.";
      }
      
      return "I apologize, but I'm having trouble connecting to the AI service right now. Please try again later.";
    }
  };

  const handleSendMessage = async () => {
    if (inputMessage.trim() !== '' && !isLoading) {
      const userMessage = inputMessage;
      
      setMessages((prevMessages) => [...prevMessages, { type: 'user', text: userMessage }]);
      setInputMessage('');
      setIsLoading(true);

      try {
        // Get framework-specific context
        const context = getFrameworkContext(selectedTemplate);

        // Step 4: Generate answer using OpenAI
        
        // Check if user wants to edit current file
        const isCodeEditRequest = activeFile && fileContent && (
          userMessage.toLowerCase().includes('edit') ||
          userMessage.toLowerCase().includes('modify') ||
          userMessage.toLowerCase().includes('change') ||
          userMessage.toLowerCase().includes('update') ||
          userMessage.toLowerCase().includes('add') ||
          userMessage.toLowerCase().includes('fix')
        );
        
        let prompt: string;
        if (isCodeEditRequest) {
          const filePreview = fileContent.split('\n').slice(0, 5).join('\n');
          prompt = `Current file: ${activeFile}\n\nFile preview (first 5 lines):\n${filePreview}...\n\nFull file content:\n${fileContent}\n\nUser request: ${userMessage}\n\nReturn the complete modified file with the requested changes.`;
        } else {
          prompt = `Use the following context to answer the question about ${selectedTemplate} development:\n\nContext:\n${context}\n\nQuestion: ${userMessage}\n\nPlease provide a helpful and accurate answer based on the context provided. Format your response using markdown for better readability. Use code blocks with appropriate language tags for code examples.`;
        }
        
        
        const answer = await askOpenAI(prompt, isCodeEditRequest);
        
        // If it's a code edit request, extract and apply the code
        if (isCodeEditRequest && activeFile && onFileUpdate) {
          const extractedCode = extractCodeFromResponse(answer);
          if (extractedCode) {
            onFileUpdate(activeFile, extractedCode);
            toast({
              title: "File updated!",
              description: `${activeFile} has been updated with AI suggestions.`,
            });
          }
        }

        setMessages((prevMessages) => [...prevMessages, { type: 'ai', text: answer }]);
      } catch (error) {
        setMessages((prevMessages) => [...prevMessages, { 
          type: 'ai', 
          text: "I apologize, but I encountered an error while processing your request. Please try again." 
        }]);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isLoading) {
      handleSendMessage();
    }
  };

  // Custom components for markdown rendering
  const markdownComponents = {
    code: ({ node, inline, className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || '');
      
      return !inline && match ? (
        <div className="code-block-container relative group">
          <div className="code-language-badge">
            {match[1]}
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
              toast({
                title: "Code copied!",
                description: "Code snippet copied to clipboard.",
              });
            }}
            className="copy-button"
            title="Copy code"
          >
            Copy
          </button>
          <pre className="bg-gray-800 rounded-lg p-4 overflow-x-auto border border-gray-600">
            <code className={`hljs language-${match[1]}`} {...props}>
              {children}
            </code>
          </pre>
        </div>
      ) : (
        <code className="bg-gray-700 px-1 py-0.5 rounded text-sm border border-gray-600" {...props}>
          {children}
        </code>
      );
    },
    pre: ({ children }: any) => (
      <div className="my-4">
        {children}
      </div>
    ),
    p: ({ children }: any) => (
      <p className="mb-3 leading-relaxed">
        {children}
      </p>
    ),
    h1: ({ children }: any) => (
      <h1 className="text-2xl font-bold mb-4 text-blue-400">
        {children}
      </h1>
    ),
    h2: ({ children }: any) => (
      <h2 className="text-xl font-semibold mb-3 text-blue-300">
        {children}
      </h2>
    ),
    h3: ({ children }: any) => (
      <h3 className="text-lg font-medium mb-2 text-blue-200">
        {children}
      </h3>
    ),
    ul: ({ children }: any) => (
      <ul className="list-disc list-inside mb-3 space-y-1">
        {children}
      </ul>
    ),
    ol: ({ children }: any) => (
      <ol className="list-decimal list-inside mb-3 space-y-1">
        {children}
      </ol>
    ),
    li: ({ children }: any) => (
      <li className="ml-4">
        {children}
      </li>
    ),
    blockquote: ({ children }: any) => (
      <blockquote className="border-l-4 border-blue-500 pl-4 italic text-gray-300 my-3">
        {children}
      </blockquote>
    ),
    a: ({ href, children }: any) => (
      <a 
        href={href} 
        target="_blank" 
        rel="noopener noreferrer"
        className="text-blue-400 hover:text-blue-300 underline"
      >
        {children}
      </a>
    ),
    strong: ({ children }: any) => (
      <strong className="font-semibold text-white">
        {children}
      </strong>
    ),
    em: ({ children }: any) => (
      <em className="italic text-gray-300">
        {children}
      </em>
    ),
    table: ({ children }: any) => (
      <div className="overflow-x-auto my-4">
        <table className="min-w-full border-collapse border border-gray-600">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }: any) => (
      <thead className="bg-gray-700">
        {children}
      </thead>
    ),
    tbody: ({ children }: any) => (
      <tbody>
        {children}
      </tbody>
    ),
    tr: ({ children }: any) => (
      <tr className="border-b border-gray-600 hover:bg-gray-700">
        {children}
      </tr>
    ),
    th: ({ children }: any) => (
      <th className="border border-gray-600 px-3 py-2 text-left font-semibold text-white">
        {children}
      </th>
    ),
    td: ({ children }: any) => (
      <td className="border border-gray-600 px-3 py-2">
        {children}
      </td>
    ),
    hr: () => (
      <hr className="border-t border-gray-600 my-6" />
    ),
    img: ({ src, alt }: any) => (
      <img 
        src={src} 
        alt={alt} 
        className="max-w-full h-auto rounded-lg my-4 border border-gray-600"
      />
    ),
  };

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e] text-[#d4d4d4]">
      <div className="bg-[#2d2d30] border-b border-[#3e3e42] flex-shrink-0">
        <div className="h-9 flex items-center justify-between px-3 text-xs font-medium">
          <span className="text-[#cccccc] uppercase tracking-wide">{title}</span>
          <div className="flex items-center gap-2">
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="w-[160px] h-6 text-xs">
                <SelectValue placeholder="Model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
              </SelectContent>
            </Select>
            {onClose && (
              <button
                onClick={onClose}
                className="text-[#cccccc] hover:text-white transition-colors"
              >
                ×
              </button>
            )}
          </div>
        </div>
        <div className="px-3 pb-2 flex items-center gap-2 text-xs text-[#969696]">
          <span>Template: <span className="text-[#cccccc]">{selectedTemplate}</span></span>
          {activeFile && (
            <>
              <span>•</span>
              <span>File: <span className="text-blue-400">{activeFile.split('/').pop()}</span></span>
            </>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800" style={{ minHeight: 0 }}>
        <div className="p-4 flex flex-col space-y-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[200px] text-center text-[#969696]">
                  <h2 className="text-xl mb-2">Welcome back, builder!</h2>
                  <p className="mb-1">Ask questions about {selectedTemplate} development</p>
                  <p className="text-sm">I'm here to help with Algorand smart contracts!</p>
                </div>
              ) : (
                messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] p-4 rounded-lg break-words ${
                        message.type === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-800 text-white border border-gray-700'
                      }`}
                    >
                      {message.type === 'user' ? (
                        <div className="whitespace-pre-wrap">{message.text}</div>
                      ) : (
                        <div className="ai-chat-prose">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeRaw, rehypeHighlight]}
                            components={markdownComponents}
                          >
                            {message.text}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] p-4 rounded-lg bg-gray-800 text-white border border-gray-700">
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                      Thinking...
                    </div>
                  </div>
                </div>
              )}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <div className="p-4 border-t border-[#3e3e42] flex items-center gap-2 flex-shrink-0">
        <Input
          type="text"
          placeholder="Ask about Algorand development..."
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          className="flex-1 p-2 rounded bg-[#2d2d30] border border-[#3e3e42] text-white"
        />
        <Button onClick={handleSendMessage} disabled={isLoading}>
          {isLoading ? 'Sending...' : 'Send'}
        </Button>
      </div>
      <Toaster />
    </div>
  );
};

export default AIChat;
