import React, { useState, useEffect } from 'react';
import { CheckCircle2, Circle, Plus, Trash2, GripVertical } from 'lucide-react';

export interface Task {
  id: string;
  title: string;
  completed: boolean;
}

export function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/tasks');
      if (res.ok) {
        const data = await res.json();
        // Only update if data changed to avoid unnecessary re-renders
        setTasks(prev => JSON.stringify(prev) !== JSON.stringify(data) ? data : prev);
      }
    } catch (e) {
      console.error('Failed to fetch tasks', e);
    } finally {
      setIsLoading(false);
    }
  };

  const saveTasks = async (newTasks: Task[]) => {
    setTasks(newTasks);
    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newTasks),
      });
    } catch (e) {
      console.error('Failed to save tasks', e);
    }
  };

  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    
    const newTask: Task = {
      id: Date.now().toString(),
      title: newTaskTitle.trim(),
      completed: false,
    };
    
    saveTasks([...tasks, newTask]);
    setNewTaskTitle('');
  };

  const toggleTask = (id: string) => {
    const newTasks = tasks.map(t => 
      t.id === id ? { ...t, completed: !t.completed } : t
    );
    saveTasks(newTasks);
  };

  const deleteTask = (id: string) => {
    const newTasks = tasks.filter(t => t.id !== id);
    saveTasks(newTasks);
  };

  const completedCount = tasks.filter(t => t.completed).length;
  const progress = tasks.length === 0 ? 0 : Math.round((completedCount / tasks.length) * 100);

  if (isLoading) {
    return <div className="p-4 text-stone-400 text-sm">Loading tasks...</div>;
  }

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] w-full">
      <div className="p-4 border-b border-stone-800">
        <h2 className="font-semibold text-stone-100 flex items-center justify-between">
          Project Tasks
          <span className="text-xs font-normal text-stone-400 bg-stone-800 px-2 py-1 rounded-full">
            {completedCount}/{tasks.length}
          </span>
        </h2>
        
        {/* Progress bar */}
        <div className="mt-3 h-1.5 w-full bg-stone-800 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-500 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {tasks.length === 0 ? (
          <div className="text-center p-4 text-stone-500 text-sm">
            No tasks yet. Add one below.
          </div>
        ) : (
          <div className="space-y-1">
            {tasks.map(task => (
              <div 
                key={task.id}
                className={`group flex items-start gap-2 p-2 rounded-lg hover:bg-stone-800/50 transition-colors ${task.completed ? 'opacity-60' : ''}`}
              >
                <button 
                  onClick={() => toggleTask(task.id)}
                  className="mt-0.5 shrink-0 text-stone-400 hover:text-blue-400 transition-colors"
                >
                  {task.completed ? (
                    <CheckCircle2 className="w-4 h-4 text-blue-500" />
                  ) : (
                    <Circle className="w-4 h-4" />
                  )}
                </button>
                <span className={`flex-1 text-sm ${task.completed ? 'line-through text-stone-500' : 'text-stone-200'}`}>
                  {task.title}
                </span>
                <button 
                  onClick={() => deleteTask(task.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-stone-500 hover:text-red-400 transition-opacity shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-stone-800 bg-[#151515]">
        <form onSubmit={addTask} className="relative">
          <input
            type="text"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder="Add a new task..."
            className="w-full bg-stone-800 border border-stone-700 rounded-lg pl-3 pr-10 py-2 text-sm text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
          />
          <button 
            type="submit"
            disabled={!newTaskTitle.trim()}
            className="absolute right-1.5 top-1.5 p-1 text-stone-400 hover:text-stone-200 disabled:opacity-50 disabled:hover:text-stone-400 bg-stone-700 rounded-md"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
