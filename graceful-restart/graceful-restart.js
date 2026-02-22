#!/usr/bin/env node
/**
 * Gateway Restart with Self-Wakeup
 * 
 * Usage:
 *   node graceful-restart.js [--task "任务描述"] [--delay seconds]
 * 
 * Examples:
 *   node graceful-restart.js
 *   node graceful-restart.js --task "继续安装 Python 包"
 *   node graceful-restart.js --task "继续安装 Python包" --delay 60
 */

import { execSync } from 'node:child_process';
import os from 'node:os';

const HOME = os.homedir();

// Parse arguments
const args = process.argv.slice(2);
let taskDescription = null;
let delaySeconds = 10;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--task' && args[i + 1]) {
    taskDescription = args[i + 1];
    i++;
  } else if (args[i] === '--delay' && args[i + 1]) {
    delaySeconds = parseInt(args[i + 1], 10);
    i++;
  }
}

// If no task specified, use default
if (!taskDescription) {
  taskDescription = "继续之前的任务";
}

console.log('🔄 Gateway Restart with Self-Wakeup');
console.log('================================');
console.log(`📝 Task: ${taskDescription}`);
console.log(`⏱️  Delay: ${delaySeconds} seconds`);
console.log('');

// Step 1: Calculate cron time
console.log('⏰ Setting up cron job...');
const futureTime = new Date(Date.now() + delaySeconds * 1000);
const cronTime = futureTime.toISOString().replace('.000Z', 'Z');

// Step 2: Create cron job with system-event
const cronCmd = `openclaw cron add \
  --at "${cronTime}" \
  --session main \
  --system-event "🔔 Gateway 已重启！有待处理任务：${taskDescription}" \
  --name "auto-wakeup" \
  --delete-after-run`;

try {
  execSync(cronCmd, { encoding: 'utf-8' });
  console.log('   ✅ Cron job created');
} catch (error) {
  console.error('   ❌ Failed to create cron job:', error.message);
  process.exit(1);
}

// Step 3: Restart Gateway
console.log('🔄 Restarting Gateway...');
try {
  execSync('openclaw gateway restart', { encoding: 'utf-8', timeout: 30000 });
  console.log('   ✅ Gateway restart initiated');
} catch (error) {
  console.error('   ❌ Failed to restart Gateway:', error.message);
  process.exit(1);
}

console.log('');
console.log('================================');
console.log('✅ All done! Gateway will restart and notify you after wakeup.');
