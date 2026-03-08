import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import prettier from 'prettier/standalone';
import babelPlugin from 'prettier/plugins/babel';
import estreePlugin from 'prettier/plugins/estree';
import htmlPlugin from 'prettier/plugins/html';
import postcssPlugin from 'prettier/plugins/postcss';
import markdownPlugin from 'prettier/plugins/markdown';
import typescriptPlugin from 'prettier/plugins/typescript';
import { Code2, Play, Code, Terminal, FileCode2, FolderTree, ChevronRight, ChevronDown, Folder, PlayCircle, Loader2, Bug, Trash2, Sparkles, FileJson, FileText, FileType2, Hash, Globe, FileImage, File, Braces, Database, AlignLeft } from 'lucide-react';

export interface ParsedFile {
  id: string;
  language: string;
  originalLanguage: string;
  path: string;
  code: string;
  isTerminal: boolean;
  isPreviewable: boolean;
}

interface CodePreviewProps {
  files: ParsedFile[];
  onAskAI?: (prompt: string) => void;
}

type TreeNode = {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children: Record<string, TreeNode>;
  file?: ParsedFile;
};

const buildTree = (files: ParsedFile[]) => {
  const root: TreeNode = { name: 'root', path: '', type: 'folder', children: {} };
  
  files.forEach(file => {
    const parts = file.path.split('/');
    let current = root;
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        current.children[part] = {
          name: part,
          path: file.path,
          type: 'file',
          children: {},
          file: file
        };
      } else {
        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            path: parts.slice(0, i + 1).join('/'),
            type: 'folder',
            children: {}
          };
        }
        current = current.children[part];
      }
    }
  });
  
  return root;
};

const getFileIcon = (filename: string, isTerminal?: boolean) => {
  if (isTerminal) return <Terminal className="w-3.5 h-3.5 shrink-0 text-green-400" />;
  
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js':
    case 'jsx':
      return <FileCode2 className="w-3.5 h-3.5 shrink-0 text-yellow-400" />;
    case 'ts':
    case 'tsx':
      return <FileType2 className="w-3.5 h-3.5 shrink-0 text-blue-400" />;
    case 'json':
      return <Braces className="w-3.5 h-3.5 shrink-0 text-green-500" />;
    case 'html':
      return <Globe className="w-3.5 h-3.5 shrink-0 text-orange-500" />;
    case 'css':
    case 'scss':
      return <Hash className="w-3.5 h-3.5 shrink-0 text-blue-300" />;
    case 'md':
      return <FileText className="w-3.5 h-3.5 shrink-0 text-stone-300" />;
    case 'py':
      return <FileCode2 className="w-3.5 h-3.5 shrink-0 text-blue-500" />;
    case 'sql':
    case 'sqlite':
      return <Database className="w-3.5 h-3.5 shrink-0 text-stone-400" />;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'svg':
      return <FileImage className="w-3.5 h-3.5 shrink-0 text-purple-400" />;
    default:
      return <File className="w-3.5 h-3.5 shrink-0 text-stone-400" />;
  }
};

const FileTreeNode = ({ node, level, selectedFileId, onSelect }: { node: TreeNode, level: number, selectedFileId: string | null, onSelect: (id: string) => void }) => {
  const [isOpen, setIsOpen] = useState(true);
  
  if (node.type === 'file') {
    const isSelected = selectedFileId === node.file?.id;
    return (
      <button
        onClick={() => onSelect(node.file!.id)}
        className={`w-full text-left py-1.5 pr-3 text-sm truncate transition-colors flex items-center gap-2 ${
          isSelected 
            ? 'bg-blue-600/20 text-blue-400 border-r-2 border-blue-500' 
            : 'text-stone-400 hover:bg-stone-800 hover:text-stone-200'
        }`}
        style={{ paddingLeft: `${level * 12 + 12}px` }}
        title={node.path}
      >
        {getFileIcon(node.name, node.file?.isTerminal)}
        <span className="truncate">{node.name}</span>
      </button>
    );
  }

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left py-1.5 pr-3 text-sm truncate transition-colors flex items-center gap-1.5 text-stone-300 hover:bg-stone-800"
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {isOpen ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-stone-500" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-stone-500" />}
        <Folder className="w-3.5 h-3.5 shrink-0 text-blue-400" />
        <span className="truncate font-medium">{node.name}</span>
      </button>
      {isOpen && (
        <div>
          {Object.values(node.children).map(child => (
            <FileTreeNode 
              key={child.path} 
              node={child} 
              level={level + 1} 
              selectedFileId={selectedFileId} 
              onSelect={onSelect} 
            />
          ))}
        </div>
      )}
    </div>
  );
};

export function CodePreview({ files, onAskAI }: CodePreviewProps) {
  const [activeTab, setActiveTab] = useState<'code' | 'preview' | 'terminal'>('code');
  const codeContainerRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [userInteracted, setUserInteracted] = useState(false);
  const [editedCodeMap, setEditedCodeMap] = useState<Record<string, string>>({});
  
  // Debugging state
  const [breakpoints, setBreakpoints] = useState<Record<string, number[]>>({});
  const [consoleLogs, setConsoleLogs] = useState<{ id: string, level: string, args: string[] }[]>([]);
  const [showConsole, setShowConsole] = useState(true);
  
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);

  const [isFormatting, setIsFormatting] = useState(false);

  const toggleBreakpoint = (fileId: string, line: number) => {
    setBreakpoints(prev => {
      const fileBps = prev[fileId] || [];
      if (fileBps.includes(line)) {
        return { ...prev, [fileId]: fileBps.filter(l => l !== line) };
      } else {
        return { ...prev, [fileId]: [...fileBps, line] };
      }
    });
  };
  
  // Terminal execution state
  const [terminalHistory, setTerminalHistory] = useState<{type: 'command' | 'output' | 'error', text: string}[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [commandInput, setCommandInput] = useState('');
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const executeCommand = async (command: string) => {
    if (!command.trim() || isExecuting) return;
    
    setIsExecuting(true);
    setTerminalHistory(prev => [...prev, { type: 'command', text: command }]);
    setCommandInput('');

    try {
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        if (data.stdout) setTerminalHistory(prev => [...prev, { type: 'output', text: data.stdout }]);
        if (data.stderr) setTerminalHistory(prev => [...prev, { type: 'error', text: data.stderr }]);
        if (!data.stdout && !data.stderr) setTerminalHistory(prev => [...prev, { type: 'output', text: '[Command completed with no output]' }]);
      } else {
        setTerminalHistory(prev => [...prev, { type: 'error', text: data.error + '\n' + (data.stderr || '') }]);
      }
    } catch (err: any) {
      setTerminalHistory(prev => [...prev, { type: 'error', text: `Network Error: ${err.message}` }]);
    } finally {
      setIsExecuting(false);
    }
  };

  const runScript = async () => {
    if (!activeFile || isExecuting) return;
    
    setActiveTab('terminal');
    setIsExecuting(true);
    setTerminalHistory(prev => [...prev, { type: 'command', text: `Run ${activeFile.path}` }]);

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: currentCode, language: activeFile.language })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        if (data.stdout) setTerminalHistory(prev => [...prev, { type: 'output', text: data.stdout }]);
        if (data.stderr) setTerminalHistory(prev => [...prev, { type: 'error', text: data.stderr }]);
        if (!data.stdout && !data.stderr) setTerminalHistory(prev => [...prev, { type: 'output', text: '[Script completed with no output]' }]);
      } else {
        setTerminalHistory(prev => [...prev, { type: 'error', text: data.error + '\n' + (data.stderr || '') }]);
      }
    } catch (err: any) {
      setTerminalHistory(prev => [...prev, { type: 'error', text: `Network Error: ${err.message}` }]);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeCommand(commandInput);
  };

  // Auto-scroll terminal
  useEffect(() => {
    if (activeTab === 'terminal' && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalHistory, activeTab]);

  // Listen for console messages from iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.source === 'preview-console') {
        setConsoleLogs(prev => [...prev, { id: Math.random().toString(), level: e.data.level, args: e.data.args }]);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleScroll = () => {
    if (codeContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = codeContainerRef.current;
      setIsNearBottom(scrollHeight - scrollTop - clientHeight < 150);
    }
  };

  const activeFile = files.find(f => f.id === selectedFileId) || files[files.length - 1];
  const fileTree = buildTree(files);
  const currentCode = activeFile ? (editedCodeMap[activeFile.id] ?? activeFile.code) : '';

  // Auto-select latest file if user hasn't interacted
  useEffect(() => {
    if (!userInteracted && files.length > 0) {
      setSelectedFileId(files[files.length - 1].id);
    }
  }, [files.length, userInteracted]);

  const isPreviewable = activeFile?.isPreviewable;
  const isTerminal = activeFile?.isTerminal;
  const isRunnableScript = activeFile?.language === 'javascript' || activeFile?.language === 'js' || activeFile?.language === 'python' || activeFile?.language === 'py';

  // Auto-switch to preview if it's a previewable language, or terminal if it's bash
  useEffect(() => {
    if (isPreviewable) {
      setActiveTab('preview');
    } else if (isTerminal) {
      setActiveTab('terminal');
    } else {
      setActiveTab('code');
    }
  }, [activeFile?.originalLanguage, isPreviewable, isTerminal]);

  // Auto-scroll to bottom when new code is added
  useEffect(() => {
    if ((activeTab === 'code' || activeTab === 'terminal') && codeContainerRef.current && isNearBottom) {
      const container = codeContainerRef.current;
      // Scroll to the bottom smoothly
      container.scrollTop = container.scrollHeight;
    }
  }, [currentCode, activeTab, isNearBottom]);

  // Update Monaco breakpoints
  useEffect(() => {
    if (editorRef.current && monacoRef.current && activeFile) {
      const bps = breakpoints[activeFile.id] || [];
      const decorations = bps.map(line => ({
        range: new monacoRef.current.Range(line, 1, line, 1),
        options: {
          isWholeLine: false,
          glyphMarginClassName: 'breakpoint-glyph'
        }
      }));
      decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, decorations);
    }
  }, [breakpoints, activeFile?.id, activeTab]);

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    
    editor.onMouseDown((e: any) => {
      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN && activeFile) {
        const lineNumber = e.target.position.lineNumber;
        toggleBreakpoint(activeFile.id, lineNumber);
      }
    });

    // Initial decorations
    if (activeFile) {
      const bps = breakpoints[activeFile.id] || [];
      const decorations = bps.map((line: number) => ({
        range: new monaco.Range(line, 1, line, 1),
        options: {
          isWholeLine: false,
          glyphMarginClassName: 'breakpoint-glyph'
        }
      }));
      decorationsRef.current = editor.deltaDecorations([], decorations);
    }
  };

  const handleFormatCode = async () => {
    if (!activeFile || isFormatting) return;
    setIsFormatting(true);
    
    try {
      let parser = 'babel';
      const plugins = [babelPlugin, estreePlugin, htmlPlugin, postcssPlugin, markdownPlugin, typescriptPlugin];
      
      const lang = activeFile.language;
      if (lang === 'html' || lang === 'xml' || lang === 'svg') parser = 'html';
      else if (lang === 'css' || lang === 'scss') parser = 'css';
      else if (lang === 'json') parser = 'json';
      else if (lang === 'markdown' || lang === 'md') parser = 'markdown';
      else if (lang === 'typescript' || lang === 'ts' || lang === 'tsx') parser = 'typescript';
      else if (lang === 'javascript' || lang === 'js' || lang === 'jsx') parser = 'babel';
      else {
        // Fallback or unsupported
        setIsFormatting(false);
        return;
      }

      const formatted = await prettier.format(currentCode, {
        parser,
        plugins,
        semi: true,
        singleQuote: true,
        trailingComma: 'es5',
      });

      setEditedCodeMap(prev => ({ ...prev, [activeFile.id]: formatted }));
    } catch (error) {
      console.error('Formatting error:', error);
    } finally {
      setIsFormatting(false);
    }
  };

  const getPreviewHtml = (language: string, code: string) => {
    // Instrument code with breakpoints
    const bps = breakpoints[activeFile.id] || [];
    let instrumentedCode = code;
    if (bps.length > 0) {
      const lines = code.split('\n');
      bps.forEach(bp => {
        if (bp > 0 && bp <= lines.length) {
          lines[bp - 1] = `debugger; ${lines[bp - 1]}`;
        }
      });
      instrumentedCode = lines.join('\n');
    }

    const consoleOverride = `
      <script>
        (function() {
          const sendLog = (level, args) => {
            try {
              const parsedArgs = Array.from(args).map(a => {
                if (a instanceof Error) return a.stack || a.message;
                if (typeof a === 'object') {
                  try { return JSON.stringify(a, null, 2); } catch(e) { return String(a); }
                }
                return String(a);
              });
              window.parent.postMessage({ source: 'preview-console', level, args: parsedArgs }, '*');
            } catch (e) {}
          };
          const origLog = console.log;
          const origErr = console.error;
          const origWarn = console.warn;
          const origInfo = console.info;
          
          console.log = function(...args) { sendLog('log', args); origLog.apply(console, args); };
          console.error = function(...args) { sendLog('error', args); origErr.apply(console, args); };
          console.warn = function(...args) { sendLog('warn', args); origWarn.apply(console, args); };
          console.info = function(...args) { sendLog('info', args); origInfo.apply(console, args); };
          
          window.onerror = function(msg, url, line, col, error) {
            sendLog('error', [\`\${msg} (Line \${line})\`]);
            return false;
          };
        })();
      </script>
    `;

    switch (language) {
      case 'html':
      case 'xml':
      case 'svg':
        return `${consoleOverride}${instrumentedCode}`;
      case 'css':
        return `
          <!DOCTYPE html>
          <html>
            <head>
              ${consoleOverride}
              <style>${instrumentedCode}</style>
              <style>
                body { font-family: system-ui, sans-serif; padding: 2rem; background: #f9fafb; color: #111827; }
                .preview-container { max-w-2xl mx-auto bg-white p-6 rounded-xl shadow-sm border border-gray-200; }
                h1 { margin-top: 0; }
              </style>
            </head>
            <body>
              <div class="preview-container">
                <h1>CSS Preview</h1>
                <p>This is a sample text to preview your CSS styles.</p>
                <button class="btn">Sample Button</button>
                <div class="box">Sample Box</div>
              </div>
            </body>
          </html>
        `;
      case 'javascript':
      case 'js':
        return `
          <!DOCTYPE html>
          <html>
            <head>
              ${consoleOverride}
              <style>
                body { font-family: ui-monospace, monospace; padding: 1rem; background: #1e1e1e; color: #d4d4d4; }
              </style>
            </head>
            <body>
              <div id="output"></div>
              <script>
                try {
                  ${instrumentedCode}
                } catch (e) {
                  console.error(e.message);
                }
              </script>
            </body>
          </html>
        `;
      case 'python':
      case 'py':
        return `
          <!DOCTYPE html>
          <html>
            <head>
              ${consoleOverride}
              <link rel="stylesheet" href="https://pyscript.net/releases/2023.11.1/core.css" />
              <script type="module" src="https://pyscript.net/releases/2023.11.1/core.js"></script>
              <style>body { font-family: system-ui, sans-serif; padding: 1rem; }</style>
            </head>
            <body>
              <py-script>
${instrumentedCode}
              </py-script>
            </body>
          </html>
        `;
      case 'react':
      case 'jsx':
      case 'tsx':
        return `
          <!DOCTYPE html>
          <html>
            <head>
              ${consoleOverride}
              <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
              <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
              <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
              <script src="https://cdn.tailwindcss.com"></script>
            </head>
            <body>
              <div id="root"></div>
              <script type="text/babel" data-type="module">
                const { useState, useEffect, useRef, useMemo, useCallback } = React;
                
                ${instrumentedCode}
                
                // Try to render if not explicitly rendered
                if (!code.includes('createRoot') && !code.includes('ReactDOM.render')) {
                  const AppComp = typeof App !== 'undefined' ? App : 
                                typeof DefaultComponent !== 'undefined' ? DefaultComponent : 
                                typeof Main !== 'undefined' ? Main : null;
                                
                  if (AppComp) {
                    const root = ReactDOM.createRoot(document.getElementById('root'));
                    root.render(<AppComp />);
                  } else {
                    console.error('Could not find an App component to render. Please name your main component "App".');
                  }
                }
              </script>
            </body>
          </html>
        `;
      default:
        return `<pre>${instrumentedCode}</pre>`;
    }
  };

  if (files.length === 0) return null;

  return (
    <div className="h-full flex bg-[#1e1e1e] rounded-2xl overflow-hidden shadow-xl border border-stone-800 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Sidebar (File Explorer) */}
      {files.length > 1 && (
        <div className="w-56 bg-[#181818] border-r border-stone-800 flex flex-col shrink-0">
          <div className="px-3 py-3 border-b border-stone-800 flex items-center gap-2 text-stone-400">
            <FolderTree className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Project Files</span>
          </div>
          <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
            {Object.values(fileTree.children).map(child => (
              <FileTreeNode 
                key={child.path} 
                node={child} 
                level={0} 
                selectedFileId={selectedFileId} 
                onSelect={(id) => {
                  setSelectedFileId(id);
                  setUserInteracted(true);
                }} 
              />
            ))}
          </div>
        </div>
      )}

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-4 py-3 bg-[#252526] border-b border-stone-800">
          <div className="flex items-center gap-4">
            <div className="flex gap-1.5 shrink-0">
              <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
            </div>
            
            <div className="flex bg-[#1e1e1e] rounded-lg p-1 border border-stone-800 overflow-x-auto hide-scrollbar">
              {!isTerminal && (
                <button
                  onClick={() => setActiveTab('code')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    activeTab === 'code' 
                      ? 'bg-stone-800 text-stone-200' 
                      : 'text-stone-500 hover:text-stone-300'
                  }`}
                >
                  <Code className="w-3.5 h-3.5" />
                  Code
                </button>
              )}
              {isPreviewable && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setActiveTab('preview')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                      activeTab === 'preview' 
                        ? 'bg-stone-800 text-stone-200' 
                        : 'text-stone-500 hover:text-stone-300'
                    }`}
                  >
                    <Play className="w-3.5 h-3.5" />
                    Preview
                  </button>
                  {activeTab === 'preview' && (
                    <button
                      onClick={() => setShowConsole(!showConsole)}
                      className={`p-1.5 rounded-md transition-colors ${showConsole ? 'bg-blue-500/20 text-blue-400' : 'text-stone-500 hover:text-stone-300 hover:bg-stone-800'}`}
                      title="Toggle Console & Inspector"
                    >
                      <Bug className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
              {isTerminal && (
                <button
                  onClick={() => setActiveTab('terminal')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    activeTab === 'terminal' 
                      ? 'bg-stone-800 text-stone-200' 
                      : 'text-stone-500 hover:text-stone-300'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  Terminal
                </button>
              )}
              {activeTab === 'code' && (
                <button
                  onClick={handleFormatCode}
                  disabled={isFormatting}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap text-stone-400 hover:text-stone-200 hover:bg-stone-800 ml-1"
                  title="Format Code"
                >
                  {isFormatting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlignLeft className="w-3.5 h-3.5" />}
                  Format
                </button>
              )}
              {isRunnableScript && (
                <button
                  onClick={runScript}
                  disabled={isExecuting}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap text-green-400 hover:text-green-300 hover:bg-green-500/10 ml-1"
                  title="Run Script"
                >
                  {isExecuting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
                  Run
                </button>
              )}
              {onAskAI && (
                <button
                  onClick={() => {
                    const prompt = `Tolong jelaskan atau perbaiki kode di file \`${activeFile.path}\` berikut ini:\n\n\`\`\`${activeFile.language}\n${currentCode}\n\`\`\``;
                    onAskAI(prompt);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 ml-1"
                  title="Ask AI about this file"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Ask AI
                </button>
              )}
            </div>
          </div>
          
          <span className="text-xs font-mono text-stone-500 uppercase tracking-wider truncate ml-4" title={activeFile.path}>
            {activeFile.path}
          </span>
        </div>
        
        <div className="flex-1 overflow-hidden bg-[#1e1e1e] flex flex-col">
          {activeTab === 'code' ? (
            <div className="flex-1 overflow-hidden">
              <Editor
                height="100%"
                language={activeFile.language === 'jsx' || activeFile.language === 'tsx' ? 'javascript' : activeFile.language}
                theme="vs-dark"
                value={currentCode}
                onMount={handleEditorDidMount}
                onChange={(value) => {
                  if (value !== undefined) {
                    setEditedCodeMap(prev => ({ ...prev, [activeFile.id]: value }));
                  }
                }}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  fontFamily: 'var(--font-mono)',
                  wordWrap: 'on',
                  scrollBeyondLastLine: false,
                  smoothScrolling: true,
                  cursorBlinking: 'smooth',
                  formatOnPaste: true,
                  suggestOnTriggerCharacters: true,
                  acceptSuggestionOnEnter: 'on',
                  quickSuggestions: true,
                  glyphMargin: true,
                }}
              />
            </div>
          ) : activeTab === 'terminal' ? (
            <div className="flex-1 flex flex-col bg-[#0d1117] font-mono text-sm overflow-hidden relative">
              {/* Terminal History */}
              <div 
                ref={codeContainerRef} 
                onScroll={handleScroll}
                className="flex-1 overflow-auto p-4 custom-scrollbar scroll-smooth text-[#e6edf3]"
              >
                {/* Initial AI Script (if it's a bash file) */}
                {isTerminal && currentCode && terminalHistory.length === 0 && (
                  <div className="mb-6 p-4 bg-[#161b22] border border-[#30363d] rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-stone-400 text-xs font-semibold uppercase tracking-wider">Generated Script</span>
                      <button 
                        onClick={() => executeCommand(currentCode)}
                        disabled={isExecuting}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/20 text-green-400 hover:bg-green-600/30 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        {isExecuting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
                        Run Script
                      </button>
                    </div>
                    <div className="flex flex-col gap-1 opacity-80">
                      {currentCode.split('\n').map((line, i) => (
                        <div key={i} className="flex gap-3">
                          <span className="text-stone-500 select-none shrink-0">$</span>
                          <span className="whitespace-pre-wrap break-all">{line}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Execution History */}
                <div className="flex flex-col gap-2">
                  {terminalHistory.map((item, i) => (
                    <div key={i} className="flex gap-3">
                      {item.type === 'command' ? (
                        <>
                          <span className="text-green-400 select-none shrink-0">user@ai-terminal:~$</span>
                          <span className="whitespace-pre-wrap break-all text-white font-medium">{item.text}</span>
                        </>
                      ) : (
                        <span className={`whitespace-pre-wrap break-all ${item.type === 'error' ? 'text-red-400' : 'text-stone-300'}`}>
                          {item.text}
                        </span>
                      )}
                    </div>
                  ))}
                  <div ref={terminalEndRef} />
                </div>
              </div>

              {/* Terminal Input */}
              <div className="p-3 bg-[#161b22] border-t border-[#30363d]">
                <form onSubmit={handleTerminalSubmit} className="flex items-center gap-3">
                  <span className="text-green-400 select-none shrink-0 font-medium">user@ai-terminal:~$</span>
                  <input
                    type="text"
                    value={commandInput}
                    onChange={(e) => setCommandInput(e.target.value)}
                    disabled={isExecuting}
                    placeholder={isExecuting ? 'Executing...' : 'Type a command...'}
                    className="flex-1 bg-transparent border-none outline-none text-[#e6edf3] placeholder-stone-600 disabled:opacity-50"
                    autoComplete="off"
                    spellCheck="false"
                  />
                </form>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col w-full bg-white overflow-hidden">
              <div className="flex-1 relative">
                <iframe
                  title="Preview"
                  srcDoc={getPreviewHtml(activeFile.originalLanguage, currentCode)}
                  className="w-full h-full border-none"
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
              
              {/* Console & Inspector Panel */}
              {showConsole && (
                <div className="h-1/3 min-h-[150px] bg-[#1e1e1e] border-t border-stone-800 flex flex-col">
                  <div className="px-3 py-2 bg-[#252526] border-b border-stone-800 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-stone-400">
                      <Bug className="w-4 h-4" />
                      <span className="text-xs font-semibold uppercase tracking-wider">Console & Inspector</span>
                    </div>
                    <button 
                      onClick={() => setConsoleLogs([])}
                      className="p-1 hover:bg-stone-700 rounded text-stone-400 hover:text-stone-200 transition-colors"
                      title="Clear Console"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-auto p-3 font-mono text-xs custom-scrollbar">
                    {consoleLogs.length === 0 ? (
                      <div className="text-stone-600 italic">No console output...</div>
                    ) : (
                      consoleLogs.map(log => (
                        <div key={log.id} className={`mb-1.5 flex gap-2 ${
                          log.level === 'error' ? 'text-red-400' : 
                          log.level === 'warn' ? 'text-yellow-400' : 
                          log.level === 'info' ? 'text-blue-400' : 'text-stone-300'
                        }`}>
                          <span className="opacity-50 shrink-0">›</span>
                          <span className="whitespace-pre-wrap break-all">{log.args.join(' ')}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
