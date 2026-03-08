import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { Groq } from 'groq-sdk';
import archiver from 'archiver';
import simpleGit from 'simple-git';

const execAsync = promisify(exec);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Create workspace directory if it doesn't exist
  const workspaceDir = path.join(process.cwd(), 'workspace');
  if (!fs.existsSync(workspaceDir)) {
    fs.mkdirSync(workspaceDir);
  }

  // Chat history file
  const chatsFile = path.join(process.cwd(), 'chats.json');
  if (!fs.existsSync(chatsFile)) {
    fs.writeFileSync(chatsFile, JSON.stringify([]));
  }

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  // --- CHAT HISTORY ENDPOINTS ---
  app.get('/api/chats', (req, res) => {
    try {
      const data = fs.readFileSync(chatsFile, 'utf-8');
      res.json(JSON.parse(data));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/chats', (req, res) => {
    try {
      const { chats } = req.body;
      fs.writeFileSync(chatsFile, JSON.stringify(chats, null, 2));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- GITHUB OAUTH ENDPOINTS ---
  app.get('/api/auth/github/url', (req, res) => {
    const redirectUri = `${process.env.APP_URL}/auth/callback`;
    const params = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID || '',
      redirect_uri: redirectUri,
      scope: 'repo',
    });
    res.json({ url: `https://github.com/login/oauth/authorize?${params}` });
  });

  app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;
    try {
      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });
      const data = await response.json();
      
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GITHUB_AUTH_SUCCESS', token: '${data.access_token}' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (error) {
      res.status(500).send('Authentication failed');
    }
  });

  // --- GITHUB PUSH ENDPOINT ---
  app.post('/api/github/push', async (req, res) => {
    const { token, repoName, commitMessage } = req.body;
    if (!token || !repoName) return res.status(400).json({ error: 'Token and repoName required' });

    try {
      // 1. Create repo on GitHub
      const createRepoRes = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
        body: JSON.stringify({ name: repoName, private: false }),
      });
      
      if (!createRepoRes.ok) {
        const errorData = await createRepoRes.json();
        // Ignore if repo already exists
        if (errorData.message !== 'Repository creation failed.' && !errorData.errors?.some((e: any) => e.message === 'name already exists on this account')) {
          throw new Error(`GitHub API error: ${JSON.stringify(errorData)}`);
        }
      }

      // Get username to construct remote URL
      const userRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' }
      });
      const userData = await userRes.json();
      const username = userData.login;

      const remoteUrl = `https://${username}:${token}@github.com/${username}/${repoName}.git`;

      // 2. Initialize git and push
      const git = simpleGit(workspaceDir);
      
      const isRepo = await git.checkIsRepo();
      if (!isRepo) {
        await git.init();
      }

      await git.addConfig('user.name', username);
      await git.addConfig('user.email', `${username}@users.noreply.github.com`);
      
      await git.add('./*');
      
      const status = await git.status();
      if (status.staged.length > 0) {
        await git.commit(commitMessage || 'Initial commit from AI Jago Coding');
      }

      const remotes = await git.getRemotes();
      if (remotes.some(r => r.name === 'origin')) {
        await git.removeRemote('origin');
      }
      await git.addRemote('origin', remoteUrl);
      
      // Rename branch to main if it's master
      const localBranches = await git.branchLocal();
      if (localBranches.current === 'master') {
        await git.branch(['-M', 'main']);
      }

      await git.push(['-u', 'origin', 'main', '--force']);

      res.json({ success: true, url: `https://github.com/${username}/${repoName}` });
    } catch (error: any) {
      console.error('GitHub Push Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- PROJECT TASKS ENDPOINTS ---
  const tasksFile = path.join(workspaceDir, 'tasks.json');

  app.get('/api/tasks', async (req, res) => {
    try {
      if (!fs.existsSync(tasksFile)) {
        await fs.promises.writeFile(tasksFile, JSON.stringify([]));
      }
      const data = await fs.promises.readFile(tasksFile, 'utf-8');
      res.json(JSON.parse(data));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/tasks', async (req, res) => {
    try {
      const tasks = req.body;
      await fs.promises.writeFile(tasksFile, JSON.stringify(tasks, null, 2));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- DOWNLOAD WORKSPACE ENDPOINT ---
  app.get('/api/download', (req, res) => {
    res.attachment('workspace.zip');
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    archive.on('error', (err) => {
      res.status(500).send({ error: err.message });
    });

    archive.pipe(res);
    archive.directory(workspaceDir, false);
    archive.finalize();
  });

  // API route for chat completion using Groq
  app.post('/api/chat', async (req, res) => {
    const { messages, systemInstruction } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    try {
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });
      
      const formattedMessages = [];
      if (systemInstruction) {
        formattedMessages.push({ role: 'system', content: systemInstruction });
      }
      
      for (const msg of messages) {
        formattedMessages.push({
          role: msg.role === 'model' ? 'assistant' : 'user',
          content: msg.text
        });
      }

      const chatCompletion = await groq.chat.completions.create({
        messages: formattedMessages,
        model: "moonshotai/kimi-k2-instruct-0905",
        temperature: 1,
        max_completion_tokens: 8192,
        top_p: 1,
        stream: true,
        stop: null
      });

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      for await (const chunk of chatCompletion) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
        }
      }
      
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error: any) {
      console.error('Groq API Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // API route for executing terminal commands
  app.post('/api/execute', async (req, res) => {
    const { command } = req.body;
    if (!command) {
      return res.status(400).json({ error: 'Command is required' });
    }

    try {
      // Execute in the workspace directory
      const { stdout, stderr } = await execAsync(command, { 
        cwd: workspaceDir,
        timeout: 30000 // 30 second timeout
      });
      res.json({ stdout, stderr });
    } catch (error: any) {
      res.status(500).json({ 
        error: error.message,
        stdout: error.stdout,
        stderr: error.stderr
      });
    }
  });

  // API route to write a file
  app.post('/api/write_file', async (req, res) => {
    const { filePath, content } = req.body;
    if (!filePath || content === undefined) {
      return res.status(400).json({ error: 'filePath and content are required' });
    }

    try {
      const fullPath = path.join(workspaceDir, filePath);
      // Ensure directory exists
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(fullPath, content);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // API route to run a script
  app.post('/api/run', async (req, res) => {
    const { code, language } = req.body;
    if (!code || !language) {
      return res.status(400).json({ error: 'Code and language are required' });
    }

    try {
      let command = '';
      let filename = '';
      
      if (language === 'javascript' || language === 'js') {
        filename = `temp_${Date.now()}.js`;
        command = `node ${filename}`;
      } else if (language === 'python' || language === 'py') {
        filename = `temp_${Date.now()}.py`;
        command = `python3 ${filename}`;
      } else {
        return res.status(400).json({ error: 'Unsupported language' });
      }

      const filePath = path.join(workspaceDir, filename);
      fs.writeFileSync(filePath, code);

      const { stdout, stderr } = await execAsync(command, { 
        cwd: workspaceDir,
        timeout: 30000
      });
      
      // Cleanup
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      res.json({ stdout, stderr });
    } catch (error: any) {
      res.status(500).json({ 
        error: error.message,
        stdout: error.stdout,
        stderr: error.stderr
      });
    }
  });

  // API route to reset workspace
  app.post('/api/reset', async (req, res) => {
    try {
      const files = fs.readdirSync(workspaceDir);
      for (const file of files) {
        fs.rmSync(path.join(workspaceDir, file), { recursive: true, force: true });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Setup WebSocket server for terminal
  const { WebSocketServer } = await import('ws');
  const { spawn } = await import('child_process');
  
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    const shell = spawn('bash', ['-i'], {
      cwd: workspaceDir,
      env: { ...process.env, TERM: 'xterm-256color' },
    });

    shell.stdout.on('data', (data) => {
      ws.send(data.toString());
    });

    shell.stderr.on('data', (data) => {
      ws.send(data.toString());
    });

    ws.on('message', (msg) => {
      shell.stdin.write(msg.toString());
    });

    ws.on('close', () => {
      shell.kill();
    });
    
    shell.on('exit', () => {
      ws.close();
    });
  });
}

startServer();
