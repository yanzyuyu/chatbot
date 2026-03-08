import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Trash2, Download, Github, Plus, MessageSquare, Menu, X, CheckSquare } from 'lucide-react';
import { ChatInterface } from './components/ChatInterface';
import { TaskList } from './components/TaskList';
import { ChatMessage, generateCodeStream } from './services/geminiService';

const SYSTEM_INSTRUCTION = `Kamu adalah seorang 10x Software Engineer dan AI Assistant yang sangat cerdas, ahli dalam troubleshooting, debugging, dan pengembangan full-stack (terutama React, Node.js, Express, Vite, dll).
Tugasmu adalah:
1. Membantu user menulis kode dengan nalar tinggi, memikirkan arsitektur, edge cases, dan best practices.
2. Melakukan troubleshooting secara mendalam. Jika user melaporkan error, analisis penyebabnya, berikan penjelasan logis, dan berikan solusi perbaikan kode yang tepat (self-healing/self-correcting).
3. Bertindak seolah-olah kamu memiliki akses ke terminal dan filesystem. Jika user meminta setup project, kamu WAJIB menggunakan tag XML khusus agar sistem dapat mengeksekusinya secara otomatis di latar belakang.

ATURAN PENTING UNTUK EKSEKUSI OTOMATIS:
- PENTING: Lingkungan saat ini adalah Node.js container. PHP, Composer, Python, dll TIDAK TERSEDIA. Jika user meminta project Laravel/PHP, jelaskan bahwa lingkungan ini hanya mendukung Node.js/JavaScript/TypeScript, lalu tawarkan alternatif seperti Express, Next.js, atau React.
- Untuk menjalankan perintah terminal, gunakan tag:
<execute>
perintah bash disini
</execute>

- DILARANG KERAS menjalankan perintah yang memblokir terminal (long-running process) seperti 'npm run dev', 'npm start', dll. Eksekusi hanya untuk setup, install, build, atau perintah sekali jalan.

- Untuk membuat atau mengubah file, gunakan tag:
<write_file path="path/ke/file.ext">
isi kode disini
</write_file>

Contoh Penggunaan:
User: "Buat project react baru bernama example-app"
Kamu:
Baik, saya akan membuat project React baru untuk Anda.
<execute>
npx create-vite example-app --template react-ts
</execute>

User: "Buat file index.js yang menampilkan hello world"
Kamu:
<write_file path="index.js">
console.log("Hello World");
</write_file>

4. MANAJEMEN TUGAS (PROJECT MANAGEMENT):
Terdapat file 'tasks.json' di root workspace yang berisi array of objects: [{ "id": "1", "title": "Task name", "completed": false }].
Kamu dapat membaca, menambah, atau mengubah status tugas di file ini untuk melacak progress proyek. Jika user meminta untuk membuat rencana atau menandai tugas selesai, perbarui file 'tasks.json' menggunakan tag <write_file path="tasks.json">.

5. Berikan penjelasan singkat namun padat. Sistem akan otomatis menjalankan tag <execute> dan <write_file> yang kamu berikan.
6. Gunakan bahasa Indonesia yang profesional, asik, dan mudah dipahami.`;

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isTasksOpen, setIsTasksOpen] = useState(false);
  const [githubToken, setGithubToken] = useState<string | null>(localStorage.getItem('github_token'));
  const [isUploading, setIsUploading] = useState(false);

  // Load sessions from server
  useEffect(() => {
    fetch('/api/chats')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setSessions(data);
          if (data.length > 0 && !currentSessionId) {
            setCurrentSessionId(data[0].id);
          }
        }
      })
      .catch(err => console.error('Failed to load chats:', err));
  }, []);

  // Save sessions to server
  useEffect(() => {
    if (sessions.length > 0) {
      fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chats: sessions })
      }).catch(err => console.error('Failed to save chats:', err));
    }
  }, [sessions]);

  // GitHub Auth Listener
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GITHUB_AUTH_SUCCESS') {
        setGithubToken(event.data.token);
        localStorage.setItem('github_token', event.data.token);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const currentSession = sessions.find(s => s.id === currentSessionId);
  const messages = currentSession?.messages || [];

  const createNewSession = () => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: 'Percakapan Baru',
      messages: [],
      updatedAt: Date.now()
    };
    setSessions([newSession, ...sessions]);
    setCurrentSessionId(newSession.id);
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSessions = sessions.filter(s => s.id !== id);
    setSessions(newSessions);
    if (currentSessionId === id) {
      setCurrentSessionId(newSessions.length > 0 ? newSessions[0].id : null);
    }
  };

  const executeBotCommands = async (text: string) => {
    // Parse <execute> tags
    const executeRegex = /<execute>([\s\S]*?)<\/execute>/g;
    let match;
    while ((match = executeRegex.exec(text)) !== null) {
      const command = match[1].trim();
      if (command) {
        try {
          const res = await fetch('/api/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command })
          });
          const data = await res.json();
          if (!res.ok) {
            console.error(`Command failed: ${command}\nError: ${data.error}\nStderr: ${data.stderr}`);
          } else {
            console.log(`Command succeeded: ${command}\nStdout: ${data.stdout}`);
          }
        } catch (e) {
          console.error('Failed to execute command:', command, e);
        }
      }
    }

    // Parse <write_file> tags
    const writeRegex = /<write_file\s+path="([^"]+)">([\s\S]*?)<\/write_file>/g;
    while ((match = writeRegex.exec(text)) !== null) {
      const path = match[1].trim();
      const content = match[2].trim();
      if (path && content) {
        try {
          const res = await fetch('/api/write_file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: path, content })
          });
          if (!res.ok) {
            const data = await res.json();
            console.error(`Failed to write file: ${path}\nError: ${data.error}`);
          } else {
            console.log(`Successfully wrote file: ${path}`);
          }
        } catch (e) {
          console.error('Failed to write file:', path, e);
        }
      }
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!currentSessionId) {
      const newSession: ChatSession = {
        id: Date.now().toString(),
        title: text.slice(0, 30) + (text.length > 30 ? '...' : ''),
        messages: [],
        updatedAt: Date.now()
      };
      setSessions([newSession, ...sessions]);
      setCurrentSessionId(newSession.id);
      // We need to wait for state to update, but React state is async.
      // So we'll just use the new session directly for this call.
      await processMessage(text, newSession.id, newSession.messages);
      return;
    }

    await processMessage(text, currentSessionId, messages);
  };

  const processMessage = async (text: string, sessionId: string, currentMessages: ChatMessage[]) => {
    const newMessage: ChatMessage = { role: 'user', text };
    const newMessages = [...currentMessages, newMessage];
    
    updateSessionMessages(sessionId, newMessages);
    setIsLoading(true);

    // Add an empty model message that we will stream into
    updateSessionMessages(sessionId, [...newMessages, { role: 'model', text: '' }]);

    try {
      const stream = generateCodeStream(newMessages, SYSTEM_INSTRUCTION);
      
      let fullResponse = '';
      for await (const chunk of stream) {
        fullResponse += chunk;
        
        setSessions(prev => prev.map(s => {
          if (s.id === sessionId) {
            const updatedMsgs = [...s.messages];
            updatedMsgs[updatedMsgs.length - 1].text = fullResponse;
            return { ...s, messages: updatedMsgs, updatedAt: Date.now() };
          }
          return s;
        }));
      }

      // After streaming is done, execute any commands
      await executeBotCommands(fullResponse);

    } catch (error: any) {
      console.error('Error generating response:', error);
      setSessions(prev => prev.map(s => {
        if (s.id === sessionId) {
          const updatedMsgs = [...s.messages];
          updatedMsgs[updatedMsgs.length - 1].text = 'Maaf, terjadi kesalahan saat memproses permintaan Anda.';
          return { ...s, messages: updatedMsgs };
        }
        return s;
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const updateSessionMessages = (sessionId: string, newMessages: ChatMessage[]) => {
    setSessions(prev => prev.map(s => {
      if (s.id === sessionId) {
        // Update title if it's the first message
        const title = s.messages.length === 0 && newMessages.length > 0 
          ? newMessages[0].text.slice(0, 30) + '...' 
          : s.title;
        return { ...s, title, messages: newMessages, updatedAt: Date.now() };
      }
      return s;
    }));
  };

  const handleDownload = async () => {
    try {
      const response = await fetch('/api/download');
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'workspace.zip';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading workspace:', error);
      alert('Failed to download workspace');
    }
  };

  const handleGithubAuth = async () => {
    try {
      const res = await fetch('/api/auth/github/url');
      const { url } = await res.json();
      window.open(url, 'oauth_popup', 'width=600,height=700');
    } catch (e) {
      console.error('Failed to get GitHub URL', e);
    }
  };

  const handleGithubPush = async () => {
    if (!githubToken) {
      handleGithubAuth();
      return;
    }

    const repoName = prompt('Masukkan nama repository baru (misal: my-laravel-app):');
    if (!repoName) return;

    setIsUploading(true);
    try {
      const res = await fetch('/api/github/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: githubToken, repoName, commitMessage: 'Initial commit from AI Jago Coding' })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Berhasil diupload ke ${data.url}`);
      } else {
        alert('Gagal upload: ' + data.error);
      }
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen flex font-sans bg-[#0e0e0e] text-stone-200">
      {/* Sidebar */}
      <aside className={`${isSidebarOpen ? 'w-64' : 'w-0'} transition-all duration-300 overflow-hidden bg-[#151515] border-r border-stone-800 flex flex-col`}>
        <div className="p-4 border-b border-stone-800 flex items-center justify-between">
          <h2 className="font-semibold text-stone-100">Riwayat Chat</h2>
          <button onClick={createNewSession} className="p-1.5 hover:bg-stone-800 rounded-md text-stone-400 hover:text-stone-200">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.map(session => (
            <div 
              key={session.id}
              onClick={() => setCurrentSessionId(session.id)}
              className={`group flex items-center justify-between p-2 rounded-md cursor-pointer transition-colors ${currentSessionId === session.id ? 'bg-stone-800 text-stone-100' : 'text-stone-400 hover:bg-stone-800/50 hover:text-stone-200'}`}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <MessageSquare className="w-4 h-4 shrink-0" />
                <span className="text-sm truncate">{session.title}</span>
              </div>
              <button 
                onClick={(e) => deleteSession(session.id, e)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-[#1e1e1e] border-b border-stone-800 py-3 px-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1.5 hover:bg-stone-800 rounded-md text-stone-400">
              <Menu className="w-5 h-5" />
            </button>
            <div className="p-2 bg-blue-600/20 rounded-lg text-blue-400 hidden sm:block">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-stone-100 tracking-tight">AI Jago Coding</h1>
              <p className="text-xs text-stone-400">Powered by Moonshot Kimi K2</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsTasksOpen(!isTasksOpen)}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${isTasksOpen ? 'bg-blue-600/20 text-blue-400' : 'bg-stone-800 hover:bg-stone-700 text-stone-200'}`}
            >
              <CheckSquare className="w-4 h-4" />
              <span className="hidden sm:inline">Tasks</span>
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Download</span>
            </button>
            <button
              onClick={handleGithubPush}
              disabled={isUploading}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg transition-colors disabled:opacity-50"
            >
              <Github className="w-4 h-4" />
              <span className="hidden sm:inline">{isUploading ? 'Uploading...' : 'Push to GitHub'}</span>
            </button>
            <button
              onClick={async () => {
                if (window.confirm('Apakah Anda yakin ingin mereset workspace? Semua file akan dihapus.')) {
                  try {
                    await fetch('/api/reset', { method: 'POST' });
                    alert('Workspace berhasil direset.');
                  } catch (e) {
                    console.error('Failed to reset workspace:', e);
                  }
                }
              }}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Reset Workspace</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-hidden flex">
          <div className="flex-1 p-4 md:p-6 overflow-hidden flex flex-col gap-4">
            <div className="flex-1 max-w-4xl w-full mx-auto flex flex-col h-full">
              <ChatInterface
                messages={messages}
                onSendMessage={handleSendMessage}
                isLoading={isLoading}
              />
            </div>
          </div>
          
          {/* Tasks Sidebar */}
          <div className={`${isTasksOpen ? 'w-80' : 'w-0'} transition-all duration-300 overflow-hidden bg-[#1e1e1e] border-l border-stone-800 flex flex-col shrink-0`}>
            <div className="w-80 h-full flex flex-col">
              <TaskList />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
