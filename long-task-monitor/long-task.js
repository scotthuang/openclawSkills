#!/usr/bin/env node
/**
 * Long Task Monitor - Main Script
 * 
 * 启动长任务监控流程
 * 
 * Usage:
 *   node long-task.js start <task_description> <worker_task>
 *   node long-task.js status [task_id]
 *   node long-task.js stop [task_id]
 *   node long-task.js complete <task_id> <result>
 * 
 * Examples:
 *   node long-task.js start "训练图像分类模型" "python train.py --epochs 100"
 *   node long-task.js status
 *   node long-task.js stop
 *   node long-task.js complete <task_id> "任务完成"
 */

import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HOME = os.homedir();
const SKILL_DIR = path.join(HOME, '.openclaw', 'workspace', 'skills', 'long-task-monitor');
const TASK_MANAGER = path.join(SKILL_DIR, 'task-manager.js');
const MONITOR_PROMPT = path.join(SKILL_DIR, 'monitor-prompt.txt');
const TASKS_DIR = path.join(HOME, '.openclaw', 'workspace', 'long-tasks');

// Helper to run command
function run(cmd, options = {}) {
  return new Promise((resolve, reject) => {
    exec(cmd, { encoding: 'utf-8', ...options }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve(stdout);
      }
    });
  });
}

// Read monitor prompt template
function getMonitorPrompt(taskId, workerSessionKey, taskDescription, workerTask, round, taskFolder) {
  let prompt = fs.readFileSync(MONITOR_PROMPT, 'utf-8');
  
  prompt = prompt.replace(/{task_id}/g, taskId)
    .replace(/{worker_session_key}/g, workerSessionKey)
    .replace(/{task_description}/g, taskDescription)
    .replace(/{worker_task}/g, workerTask)
    .replace(/{round}/g, round.toString())
    .replace(/{task_folder}/g, taskFolder);
  
  return prompt;
}

// Get task info
function getTask(taskId) {
  const taskPath = path.join(TASKS_DIR, taskId, 'task.json');
  if (!fs.existsSync(taskPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(taskPath, 'utf-8'));
}

// Update task session keys
async function updateSessionKeys(taskId, workerSessionKey, monitorSessionKey) {
  if (workerSessionKey) {
    await run(`node "${TASK_MANAGER}" update ${taskId} workerSessionKey "${workerSessionKey}"`);
  }
  if (monitorSessionKey) {
    await run(`node "${TASK_MANAGER}" update ${taskId} monitorSessionKey "${monitorSessionKey}"`);
  }
}

// Generate Worker spawn command
function generateWorkerSpawnCommand(taskId, workerTask) {
  const workerLabel = `worker-${taskId}`;
  const workerPrompt = `你是 Worker Agent，负责执行以下任务：

${workerTask}

## 重要规则
1. 正常执行任务，不需要汇报进度
2. 如果任务需要多轮交互，继续执行直到完成
3. 任务完成后返回最终结果`;

  const escapedPrompt = workerPrompt.replace(/"/g, '\\"').replace(/\n/g, '\\n');
  return {
    command: `sessions_spawn(task="${escapedPrompt}", label="${workerLabel}", cleanup="keep")`,
    label: workerLabel
  };
}

// Generate Monitor spawn command
function generateMonitorSpawnCommand(taskId, workerSessionKey, taskDescription, workerTask, round) {
  const taskFolder = path.join(TASKS_DIR, taskId);
  const monitorLabel = `monitor-${taskId}`;
  
  const prompt = getMonitorPrompt(taskId, workerSessionKey, taskDescription, workerTask, round, taskFolder);
  const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n');
  
  return {
    command: `sessions_spawn(task="${escapedPrompt}", label="${monitorLabel}", cleanup="delete")`,
    label: monitorLabel
  };
}

// Complete task and cleanup sessions
async function completeTask(taskId, result) {
  console.log(`✅ Completing task: ${taskId}`);
  
  const task = getTask(taskId);
  if (!task) {
    console.log('❌ Task not found');
    return;
  }
  
  // Update task status
  const endedAt = new Date().toISOString();
  const startedAt = task.createdAt;
  const durationMs = new Date(endedAt) - new Date(startedAt);
  const durationMinutes = Math.round(durationMs / 60000);
  
  const status = {
    taskId,
    status: 'completed',
    startedAt,
    endedAt,
    durationMinutes,
    totalMonitorRounds: task.monitorRound,
    workerRestartCount: task.workerRestartCount,
    result
  };
  
  const statusPath = path.join(TASKS_DIR, taskId, 'status.json');
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
  
  // Update task status
  const taskPath = path.join(TASKS_DIR, taskId, 'task.json');
  const updatedTask = { ...task, status: 'completed', endedAt };
  fs.writeFileSync(taskPath, JSON.stringify(updatedTask, null, 2));
  
  console.log(`✅ Task completed in ${durationMinutes} minutes`);
  console.log(`   Result: ${result}`);
  
  // Cleanup sessions if they exist
  if (task.workerSessionKey) {
    console.log(`\n🧹 Cleanup sessions:`);
    console.log(`   Worker: ${task.workerSessionKey}`);
    
    // Kill Worker process
    try {
      await run(`openclaw sessions kill ${task.workerSessionKey} 2>/dev/null || true`);
      console.log(`   ✅ Worker session killed`);
    } catch (e) {
      console.log(`   ⚠️ Failed to kill Worker: ${e.message}`);
    }
  }
  
  if (task.monitorSessionKey) {
    console.log(`   Monitor: ${task.monitorSessionKey}`);
    
    try {
      await run(`openclaw sessions kill ${task.monitorSessionKey} 2>/dev/null || true`);
      console.log(`   ✅ Monitor session killed`);
    } catch (e) {
      console.log(`   ⚠️ Failed to kill Monitor: ${e.message}`);
    }
  }
}

// Show task status
async function showStatus() {
  console.log('📋 Current Tasks:\n');
  await run(`node "${TASK_MANAGER}" list`);
}

// Show usage
function showUsage() {
  console.log(`
Long Task Monitor - 启动和管理长任务

Usage:
  node long-task.js start <description> <worker_task>
    启动新的长任务
  
  node long-task.js status
    查看当前任务状态
  
  node long-task.js update <task_id> worker <sessionKey>
    更新 Worker Session Key
  
  node long-task.js update <task_id> monitor <sessionKey>
    更新 Monitor Session Key
  
  node long-task.js complete <task_id> <result>
    标记任务完成并清理 sessions
  
  node long-task.js worker-command <task_id> <worker_task>
    生成 Worker 启动命令
  
  node long-task.js monitor-command <task_id> <worker_session_key> [round]
    生成 Monitor 启动命令
  
  node long-task.js folder <task_id>
    获取任务文件夹路径

Examples:
  node long-task.js start "训练图像分类模型" "python train.py --epochs 100"
  node long-task.js status
  node long-task.js update task-xxx worker agent:main:subagent:yyy
  node long-task.js complete task-xxx "任务成功完成"
`);
}

// Parse command
const cmd = process.argv[2];
const arg1 = process.argv[3];
const arg2 = process.argv[4];
const arg3 = process.argv[5];

switch (cmd) {
  case 'start':
    if (!arg1) {
      showUsage();
      process.exit(1);
    }
    const workerTask = arg2 || arg1;
    console.log(`🚀 Starting Long Task: ${arg1}`);
    console.log(`   Worker Task: ${workerTask}\n`);
    
    // Create task
    await run(`node "${TASK_MANAGER}" create "${arg1}" "${workerTask}"`);
    
    // Get latest task
    const tasks = await run(`node "${TASK_MANAGER}" list`);
    const match = tasks.match(/\[(task-[^\]]+)\]/);
    if (!match) {
      console.log('❌ Failed to create task');
      process.exit(1);
    }
    const taskId = match[1];
    const taskFolder = path.join(TASKS_DIR, taskId);
    
    console.log(`\n📁 Task Folder: ${taskFolder}`);
    console.log(`\n⚙️  Step 1: Generate Worker spawn command:`);
    const workerCmd = generateWorkerSpawnCommand(taskId, workerTask);
    console.log(workerCmd.command);
    console.log(`\n📝 ⚠️ 获取 Worker Session Key 后，运行以下命令保存:`);
    console.log(`   node "${TASK_MANAGER}" update ${taskId} workerSessionKey "<Worker Session Key>"`);
    console.log(`\n📝 然后告诉我 Worker Session Key，我会帮你启动 Monitor。`);
    break;
    
  case 'worker-command':
    if (!arg1 || !arg2) {
      console.error('Usage: node long-task.js worker-command <task_id> <worker_task>');
      process.exit(1);
    }
    console.log(generateWorkerSpawnCommand(arg1, arg2).command);
    break;
    
  case 'monitor-command':
    if (!arg1 || !arg2) {
      console.error('Usage: node long-task.js monitor-command <task_id> <worker_session_key> [round]');
      process.exit(1);
    }
    const taskInfo = getTask(arg1);
    if (!taskInfo) {
      console.error(`Task not found: ${arg1}`);
      process.exit(1);
    }
    const round = parseInt(process.argv[5]) || 1;
    console.log(generateMonitorSpawnCommand(
      arg1,
      arg2,
      taskInfo.description,
      taskInfo.workerTask,
      round
    ).command);
    break;
    
  case 'status':
    showStatus();
    break;
    
  case 'complete':
    if (!arg1 || !arg2) {
      console.error('Usage: node long-task.js complete <task_id> <result>');
      process.exit(1);
    }
    completeTask(arg1, arg2).catch(console.error);
    break;
    
  case 'folder':
    if (!arg1) {
      console.error('Usage: node long-task.js folder <task_id>');
      process.exit(1);
    }
    console.log(path.join(TASKS_DIR, arg1));
    break;
    
  case 'update':
    // Update session keys: node long-task.js update <task_id> worker <sessionKey>
    // or: node long-task.js update <task_id> monitor <sessionKey>
    const updateTaskId = arg1;
    const updateType = arg2;
    const updateSessionKey = arg3;
    if (!updateTaskId || !updateType || !updateSessionKey) {
      console.error('Usage: node long-task.js update <task_id> worker|monitor <sessionKey>');
      process.exit(1);
    }
    const updateField = updateType === 'worker' ? 'workerSessionKey' : updateType === 'monitor' ? 'monitorSessionKey' : null;
    if (!updateField) {
      console.error('Usage: node long-task.js update <task_id> worker|monitor <sessionKey>');
      process.exit(1);
    }
    run(`node "${TASK_MANAGER}" update ${updateTaskId} ${updateField} "${updateSessionKey}"`).then(() => {
      console.log(`✅ Updated ${updateField} for task ${updateTaskId}`);
    }).catch(console.error);
    break;
    
  default:
    showUsage();
}
